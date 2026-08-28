#!/usr/bin/env node
/**
 * Faz 13.3 — telefondan erişilebilen bir yerel yığın.
 *
 * `EXPO_PUBLIC_*` **derleme anında gömülür**: `mobile/src/api/client.ts`'in okuduğu
 * `EXPO_PUBLIC_API_URL` APK'nın içine yazılır ve çalışma anında düzeltilemez. Bir APK
 * `localhost:3000` ile derlenirse telefonda ölü doğar — telefonun `localhost`'u
 * telefonun kendisidir. Bu script o adresi doğru yapan tek yer.
 *
 * ## Neden Cloudflare quick tunnel
 *
 * Seçenekler arasından `cloudflared`'in adsız ("quick") tüneli seçildi:
 *
 *   - **Hesap yok.** `ngrok` ücretsiz katmanda bile kayıt + authtoken istiyor ve tek
 *     eşzamanlı tünel veriyor; burada iki tane gerekiyor (uygulama ve MinIO).
 *   - **Kurulum yok.** Tek dosyalık resmi ikili; bu script onu `.tunnel/` altına indirir,
 *     sisteme hiçbir şey kurmaz, yönetici hakkı istemez. PATH'te `cloudflared` varsa onu
 *     kullanır. (`npx localtunnel` kurulum istemiyor ama araya tarayıcı uyarı sayfası
 *     koyuyor ve sık düşüyor — bir test turunu taşıyacak kadar sağlam değil.)
 *   - **HTTPS, geçerli sertifikayla.** İki sorunu birden çözüyor: telefon erişiyor **ve**
 *     Android'in cleartext yasağı hiç devreye girmiyor, yani `expo-build-properties` ile
 *     `usesCleartextTraffic` açmaya gerek kalmıyor — production'a sızacak bir ayar yok.
 *   - **Host başlığını koruyor.** MinIO'nun imzalı URL'leri SigV4 ile `host` başlığını
 *     imzalar (`src/shared/storage/index.ts`, `forcePathStyle: true`). `cloudflared`
 *     gelen `Host`'u olduğu gibi ilettiği için imza MinIO'da doğrulanır; Host'u yeniden
 *     yazan bir tünel fotoğraf yüklemesini `SignatureDoesNotMatch` ile kırardı.
 *
 * ## Neden iki tünel
 *
 * `14-file-storage-and-media.md` §Upload flow: yükleme URL'i MinIO'ya **doğrudan**
 * gidiyor, uygulama üzerinden değil. Yani telefonun `S3_ENDPOINT`'e de erişmesi gerek.
 * Sunucu tarafı da aynı adresi bilmeli, çünkü imzayı ve `CDN_BASE_URL`'i o üretiyor —
 * `localhost:9000` ile imzalanmış bir URL telefonda hiçbir şeye çözülmez.
 *
 * ## Neden sunucuyu da bu script başlatıyor
 *
 * Adres her açılışta değişiyor. Elle düzenlenen bir `.env` bırakmak, bir sonraki turda
 * bayat adresle saatlerce yanlış hata aramak demek. Bunun yerine değişkenler doğrudan
 * çocuk süreçlerin ortamına konuyor: Next de (`process.env` > `.env`), worker da
 * (`node --env-file` mevcut ortamı ezmez) dosyadaki değeri değil bu değeri görüyor.
 * Geriye bayat hiçbir şey kalmıyor.
 *
 * `.env.example` ve `.env` `localhost` kalır — `23-deployment-and-environments.md`
 * §Configuration'ın varsayılanları bu dosyanın konusu değil. Bu yalnızca yerel test
 * profili; production yapılandırmasına dokunmaz.
 */
import { spawn, spawnSync } from 'node:child_process'
import { chmodSync, createWriteStream, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { rmSync, writeFileSync } from 'node:fs'
import { connect } from 'node:net'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const CACHE_DIR = '.tunnel'
const ADDRESS_FILE = join(CACHE_DIR, 'adres.env')
const EAS_JSON = join('mobile', 'eas.json')

const APP_PORT = 3000
const MINIO_PORT = 9000
const POSTGRES_PORT = 5432

/** Resmi cloudflared sürüm varlıkları. `latest` etiketi Cloudflare'in kendi yönlendirmesi. */
const RELEASE = 'https://github.com/cloudflare/cloudflared/releases/latest/download'
const ASSETS = {
  'win32-x64': 'cloudflared-windows-amd64.exe',
  'win32-arm64': 'cloudflared-windows-amd64.exe',
  'win32-ia32': 'cloudflared-windows-386.exe',
  'linux-x64': 'cloudflared-linux-amd64',
  'linux-arm64': 'cloudflared-linux-arm64',
  'linux-arm': 'cloudflared-linux-arm',
  'darwin-x64': 'cloudflared-darwin-amd64.tgz',
  'darwin-arm64': 'cloudflared-darwin-arm64.tgz',
}

const QUICK_URL = /https:\/\/[a-z0-9][a-z0-9-]*\.trycloudflare\.com/i

const children = []
let easOriginal = null
let shuttingDown = false

function say(line = '') {
  process.stdout.write(`${line}\n`)
}

const WARNING = [
  'DIKKAT - tunel acikken yerel sunucun INTERNETE ACIK.',
  '',
  'Adresi bilen herkes uygulamaya ve MinIO deposuna ulasabilir.',
  '',
  'MinIO kimlik bilgileri .env.example icinde, yani PUBLIC depoda:',
  'adresi bulan yalnizca okumakla kalmaz, DEPOYA YAZABILIR de.',
  '',
  'Bu turda YALNIZ demo verisi bulunsun: gercek kisisel veri,',
  'gercek sozlesme, gercek fotograf koyma.',
  'Is bitince Ctrl+C ile kapat - tunel iner, sunucu kapanir.',
]

function banner() {
  // Padded from the text, not by hand: a box drawn with counted spaces goes crooked the
  // first time a line is edited.
  const width = Math.max(...WARNING.map((line) => line.length)) + 4
  const rule = `  +${'-'.repeat(width)}+`

  say()
  say(rule)
  for (const line of WARNING) say(`  |  ${line.padEnd(width - 2)}|`)
  say(rule)
  say()
}

/** Bir portta dinleyen var mı. TCP bağlanabiliyorsa var. */
function portOpen(port) {
  return new Promise((resolve) => {
    const socket = connect({ host: '127.0.0.1', port })
    const done = (result) => {
      socket.destroy()
      resolve(result)
    }
    socket.setTimeout(1000)
    socket.once('connect', () => done(true))
    socket.once('timeout', () => done(false))
    socket.once('error', () => done(false))
  })
}

async function waitForPort(port, label, attempts = 45) {
  for (let index = 0; index < attempts; index += 1) {
    if (await portOpen(port)) return
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }
  throw new Error(`${label} (port ${port}) 90 saniyede acilmadi. Docker Desktop calisiyor mu?`)
}

/** `.env`'den tek bir değişken — bucket adı için. Dosya yoksa örnekteki varsayılan. */
function readEnvValue(name, fallback) {
  for (const file of ['.env', '.env.example']) {
    if (!existsSync(file)) continue
    const match = new RegExp(`^${name}\\s*=\\s*"?([^"\\r\\n]+)"?`, 'm').exec(
      readFileSync(file, 'utf8'),
    )
    if (match !== null) return match[1].trim()
  }
  return fallback
}

async function download(url, destination) {
  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok || response.body === null) {
    throw new Error(`indirilemedi: ${url} -> HTTP ${response.status}`)
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(destination))
}

/**
 * PATH'teki `cloudflared`, yoksa `.tunnel/` altındaki kopya, o da yoksa resmi sürümden
 * indirilen tek dosya. Sisteme hiçbir şey kurulmaz.
 */
async function ensureCloudflared() {
  const onPath = spawnSync('cloudflared', ['--version'], { stdio: 'ignore', shell: true })
  if (onPath.status === 0) {
    say('  cloudflared: PATH uzerinde bulundu.')
    return 'cloudflared'
  }

  const key = `${process.platform}-${process.arch}`
  const asset = ASSETS[key]
  if (asset === undefined) throw new Error(`cloudflared icin hazir ikili yok: ${key}`)

  mkdirSync(CACHE_DIR, { recursive: true })
  const binary = join(CACHE_DIR, process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared')
  if (existsSync(binary)) {
    say(`  cloudflared: yerel kopya kullaniliyor (${binary}).`)
    return binary
  }

  say(`  cloudflared indiriliyor - ${RELEASE}/${asset}`)
  if (asset.endsWith('.tgz')) {
    const archive = join(CACHE_DIR, asset)
    await download(`${RELEASE}/${asset}`, archive)
    const untar = spawnSync('tar', ['-xzf', archive, '-C', CACHE_DIR], { stdio: 'inherit' })
    if (untar.status !== 0) throw new Error('tgz acilamadi')
    rmSync(archive, { force: true })
  } else {
    await download(`${RELEASE}/${asset}`, binary)
  }
  if (process.platform !== 'win32') chmodSync(binary, 0o755)
  say('  cloudflared hazir.')
  return binary
}

/** Bir quick tunnel açar ve cloudflared'in bastığı adresi yakalar. */
function startTunnel(binary, port, label) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      binary,
      ['tunnel', '--no-autoupdate', '--url', `http://localhost:${port}`],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )
    children.push({ label: `tunel:${label}`, child })

    let settled = false
    const finish = (fn, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      fn(value)
    }
    const timer = setTimeout(() => {
      finish(reject, new Error(`${label} tuneli 90 saniyede adres vermedi.`))
    }, 90_000)

    const scan = (chunk) => {
      const match = QUICK_URL.exec(String(chunk))
      if (match !== null) finish(resolve, match[0])
    }

    child.stdout.on('data', scan)
    child.stderr.on('data', scan)
    child.once('error', (error) => finish(reject, error))
    child.once('exit', (code) => {
      // Before the address arrives this is a startup failure; after it, it is the death of
      // a live address — a different event with a different meaning, and the one that used
      // to pass silently because `finish` no-ops once settled.
      if (settled) tunnelDied(label, code)
      else finish(reject, new Error(`${label} tuneli beklenmedik bicimde kapandi (kod ${code}).`))
    })
  })
}

/**
 * A tunnel that dies **after** the address was published.
 *
 * The whole stack comes down, deliberately, and no reconnect is attempted. A quick tunnel
 * gets a NEW random hostname every time it starts, and the address the APK carries was
 * burned in at build time — so a silent reconnect would leave a window that looks healthy,
 * a server that is up, and a phone that can never reach it again. Better to say the address
 * is dead once, loudly, than to keep printing one that resolves to nothing.
 */
function tunnelDied(label, code) {
  if (shuttingDown) return
  say()
  say('  ####################################################################')
  say(`  #  TUNEL DUSTU: ${label} (kod ${code})`)
  say('  #')
  say('  #  Adres oldu. Bu adresle derlenmis APK artik calismaz.')
  say('  #  Yapilacak: bu pencereyi yeniden baslat (yeni adres alir),')
  say('  #  sonra APK yi YENIDEN DERLE - ya da uygulamadaki "sunucu adresi"')
  say('  #  alanina yeni adresi yapistir (preview build bunu destekler).')
  say('  #')
  say('  #  Yeniden baglanma DENENMEDI: her acilista adres degisiyor, sessizce')
  say('  #  yeni adres almak telefonu sessizce disarida birakirdi.')
  say('  ####################################################################')
  shutdown(1)
}

/**
 * `eas build` profilin `env` bloğunu **yerel dosyadan** okur, o yüzden adres oraya
 * yazılmalı. Tur bitince dosya bire bir geri alınır: depoda dönen bir adres kalmaz.
 */
function patchEasJson(apiUrl) {
  const text = readFileSync(EAS_JSON, 'utf8')
  const config = JSON.parse(text)

  if (QUICK_URL.test(JSON.stringify(config.build.preview.env ?? {}))) {
    say('  Uyari: eas.json icinde onceki turdan kalma bir tunel adresi vardi, geri alindi.')
    easOriginal = text.replace(QUICK_URL, `http://localhost:${APP_PORT}`)
  } else {
    easOriginal = text
  }

  config.build.preview.env = { ...config.build.preview.env, EXPO_PUBLIC_API_URL: apiUrl }
  writeFileSync(EAS_JSON, `${JSON.stringify(config, null, 2)}\n`)
}

function restoreEasJson() {
  if (easOriginal === null) return
  writeFileSync(EAS_JSON, easOriginal)
  easOriginal = null
}

/** Çocuğun çıktısını etiketleyerek tek pencereye akıtır. */
function pipeLabelled(label, child) {
  for (const stream of [child.stdout, child.stderr]) {
    if (stream === null) continue
    let carry = ''
    stream.on('data', (chunk) => {
      const lines = (carry + String(chunk)).split(/\r?\n/)
      carry = lines.pop() ?? ''
      for (const line of lines) say(`  [${label}] ${line}`)
    })
  }
}

function startChild(label, command, environment) {
  const child = spawn(command, {
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: environment,
  })
  children.push({ label, child })
  pipeLabelled(label, child)
  return child
}

/** Windows'ta `cmd` altındaki torunlar SIGINT ile ölmez; ağacı kökten kes. */
function killTree({ child }) {
  if (child.exitCode !== null || child.signalCode !== null) return
  if (process.platform === 'win32' && child.pid !== undefined) {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    return
  }
  child.kill('SIGTERM')
}

function shutdown(code = 0) {
  if (shuttingDown) return
  shuttingDown = true
  say()
  say('  Kapatiliyor - tunel iniyor, sunucu duruyor...')
  for (const entry of children) killTree(entry)
  restoreEasJson()
  rmSync(ADDRESS_FILE, { force: true })
  say('  Tunel kapandi. Sunucu artik internete acik degil.')
  say('  (Postgres ve MinIO calisiyor - "Hemen Pergola - durdur.cmd" onlari durdurur.)')
  process.exit(code)
}

async function main() {
  banner()

  if (!existsSync(EAS_JSON)) {
    throw new Error(`${EAS_JSON} bulunamadi - bu script depo kokunden calistirilmali.`)
  }

  if (await portOpen(APP_PORT)) {
    throw new Error(
      `Port ${APP_PORT} dolu. Bu script web sunucusunu kendisi baslatir: once acik olan\n` +
        '  "Hemen Pergola - web" / "Hemen Pergola - worker" pencerelerini kapat.',
    )
  }

  say('  [1/6] Postgres ve MinIO baslatiliyor...')
  spawnSync('docker compose up -d', { shell: true, stdio: 'ignore' })
  await waitForPort(POSTGRES_PORT, 'Postgres')
  await waitForPort(MINIO_PORT, 'MinIO')

  say('  [2/6] Veritabani semasi guncelleniyor...')
  const migrate = spawnSync('pnpm prisma migrate deploy', { shell: true, stdio: 'ignore' })
  if (migrate.status !== 0) {
    throw new Error('migration basarisiz - once "Hemen Pergola - ilk kurulum.cmd" calistir.')
  }

  say('  [3/6] Tunel araci hazirlaniyor...')
  const binary = await ensureCloudflared()

  say('  [4/6] Tuneller aciliyor (adres her acilista degisir)...')
  const apiUrl = await startTunnel(binary, APP_PORT, 'uygulama')
  const minioUrl = await startTunnel(binary, MINIO_PORT, 'minio')

  const bucket = readEnvValue('S3_BUCKET', 'pergola-local')
  const overrides = {
    // Uygulamanın kendini gösterdiği adres — davet/doğrulama bağlantıları buradan üretilir.
    AUTH_URL: apiUrl,
    NEXT_PUBLIC_SITE_URL: apiUrl,
    // İmzalı yükleme/okuma URL'leri bu host'la imzalanır; telefon buraya doğrudan bağlanır.
    S3_ENDPOINT: minioUrl,
    CDN_BASE_URL: `${minioUrl}/${bucket}`,
  }

  say('  [5/6] Adres eas.json dosyasina yaziliyor...')
  patchEasJson(apiUrl)
  mkdirSync(CACHE_DIR, { recursive: true })
  writeFileSync(
    ADDRESS_FILE,
    [
      '# Bu tur icin uretildi. Elle duzenleme - script kapaninca silinir.',
      `EXPO_PUBLIC_API_URL=${apiUrl}`,
      ...Object.entries(overrides).map(([key, value]) => `${key}=${value}`),
      '',
    ].join('\n'),
  )

  say('  [6/6] Web sunucusu ve worker baslatiliyor...')
  const environment = { ...process.env, ...overrides }
  /*
   * `pnpm dev` is correct again as of 13.5: the strict-CSP surfaces were non-interactive
   * under the dev server since Faz 9 (`23` §Runtime, "The CSP has a development branch"),
   * which would have walked the E6 round straight into a dead page. The alternative
   * considered here was `pnpm build && pnpm start` — closer to what a device meets, but a
   * minute of build per change, and it would have left the everyday dev server broken.
   */
  startChild('web', 'pnpm dev', environment)
  startChild('worker', 'pnpm worker', environment)

  say()
  say('  --------------------------------------------------------------------')
  say(`  Uygulama : ${apiUrl}`)
  say(`  MinIO    : ${minioUrl}`)
  say()
  say('  APK almak icin BASKA bir pencerede, tunel acikken:')
  say('      cd mobile')
  say('      eas build -p android --profile preview')
  say()
  say('  Adres eas.json dosyasina yazildi; Ctrl+C sonrasi dosya eski haline doner.')
  say('  Adim adim: mobile/TEST-APK.md')
  say('  --------------------------------------------------------------------')
  banner()
  say('  Kapatmak icin: Ctrl+C')
  say()
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => shutdown(0))
}

main().catch((error) => {
  say()
  say(`  HATA: ${error.message}`)
  shutdown(1)
})
