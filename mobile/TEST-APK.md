# Test APK'sı — telefona kurulum

Fiziksel bir Android'de tam tur (`29` §E, E6) için. Komut listesi; her adım bir öncekini
gerektirir.

**Bu komutları sen çalıştırıyorsun.** Hesap açma, `eas login` ve build tetikleme hesap
sahibinin işi — depoda saklanacak hiçbir kimlik bilgisi yok (`store/surumleme-ve-imza.md`).

---

## 0 · Bir kez: hesap ve araç

1. https://expo.dev üzerinden ücretsiz bir Expo hesabı aç. (`29` §F, F6)
2. `eas-cli` kur ve giriş yap:

```bash
npm install -g eas-cli
```

```bash
eas login
```

3. Projeyi hesaba bağla — bu `app.json`'a bir `projectId` yazar, bir kez:

```bash
cd mobile
```

```bash
eas init
```

Bu üçü bittiğinde F6 kapanır. FCM anahtarı (F7) **gerekmiyor**: onsuz da build alınır,
yalnızca bildirim gelmez — aşağıya bak.

---

## 1 · Her turda: tüneli başlat

Depo kökünde, `"Hemen Pergola.cmd"` **kapalıyken**:

```
"Hemen Pergola - tunel.cmd"
```

Aynısı komut satırından:

```bash
node scripts/tunnel.mjs
```

Script sırayla: Postgres + MinIO'yu ayağa kaldırır, migration'ı uygular, iki HTTPS tüneli
açar (uygulama ve MinIO), adresleri `mobile/eas.json`'a ve web + worker süreçlerinin
ortamına yazar, sonra ikisini de başlatır. Ekrana iki adres basar:

```
Uygulama : https://....trycloudflare.com
MinIO    : https://....trycloudflare.com
```

**Bu pencere test bitene kadar açık kalacak.** Kapanırsa ya da tünel düşerse adres ölür;
script bunu büyük harflerle yazar ve tüm yığını kapatır — sessizce yeni adres almaz, çünkü
uygulamanın elindeki adres eskisi olur.

> Tünel açıkken yerel sunucun internete açıktır. MinIO kimlik bilgileri `.env.example`
> içinde, yani public depoda: adresi bulan okumakla kalmaz, depoya yazabilir de. Yalnız
> demo verisiyle çalış, iş bitince Ctrl+C ile kapat.

---

## 2 · **Bir kez**: APK'yı derle

Tünelin açık olması gerekmiyor — adres uygulamanın içinden değiştirilebiliyor (§3).

```bash
cd mobile
```

```bash
eas build -p android --profile preview
```

- İlk koşuda EAS bir Android keystore üretmeyi teklif eder → **evet**. Anahtar EAS
  hesabında kalır, depoya inmez.
- Tünel açıkken derlersen `eas.json`'daki adres o turun adresidir ve uygulama doğrudan
  açılır; "You have uncommitted changes" uyarısı bundan ve `app.json`'daki `versionCode`
  artışından gelir. Devam et — script çıkarken `eas.json`'ı geri alır.
- Build bulutta koşar (~10–20 dk). Biten build'in APK bağlantısını terminal ve
  https://expo.dev/accounts/<hesap>/projects/hemen-pergola/builds verir.

**Yeniden derlemen gereken tek durum:** mobil kodun kendisi değiştiğinde. Tünel adresinin
değişmesi bir sebep değil.

### Telefona kur

1. APK bağlantısını telefonun tarayıcısında aç (ya da QR'ı okut) ve indir.
2. Android "bilinmeyen kaynak" uyarısı verir: **Ayarlar → İzin ver** — izin indirmeyi
   yapan uygulamaya (Chrome / Dosyalar) verilir, tek seferlik.
3. İndirilenler → APK'ya dokun → **Kur**.

Aynı `versionCode` ile ikinci kez kurmaya çalışırsan Android reddeder; `preview` profili
her build'de numarayı artırdığı için üst üste kurulum sorunsuz (`store/surumleme-ve-imza.md`).

---

## 3 · Her turda: adresi uygulamaya söyle

Tünel her açılışta yeni bir adres veriyor. Uygulamayı açtığında **giriş ekranının altında**
"Sunucu adresi (yalnız test sürümü)" alanı var:

1. Tünel penceresindeki `Uygulama : https://...` adresini kopyala.
2. Alana yapıştır → **Adresi kaydet**.
3. Giriş yap.

Adres telefonda saklanır; aynı tur içinde uygulamayı kapatıp açsan da durur. Ertesi tur
yeni adresi aynı alana yapıştırırsın — build yok, bekleme yok.

Bu alan **yalnızca `preview` ve `development` profillerinde** var: `eas.json` o iki profile
`EXPO_PUBLIC_ALLOW_SERVER_OVERRIDE=1` veriyor, `production` vermiyor ve
`test/mobile-server-override.test.ts` bu yokluğu iddia ediyor. Mağaza sürümünde alan yok —
olsaydı uygulamayı istediği sunucuya yönlendiren birine kimlik bilgisi teslim ederdi.

---

## 4 · Sırayla

Bir kez:

```
1. Expo hesabı + eas-cli + eas init
2. cd mobile && eas build -p android --profile preview
3. APK'yı telefona indir + kur
```

Her turda:

```
1. "Hemen Pergola - tunel.cmd"      (aç, açık bırak)
2. Ekrandaki "Uygulama" adresini kopyala
3. Telefonda giriş ekranı → "Sunucu adresi" → yapıştır → kaydet
4. Demo hesabıyla giriş yap, testi koştur
5. Bitince tünel penceresinde Ctrl+C
```

Demo hesapları `"Hemen Pergola.cmd"` penceresindekilerle aynı:

```
Musteri   musteri@pergola.local    / phase4-core-flow-customer-password
Uretici   owner@egepergola.local   / phase3-pilot-manufacturer-password
```

---

## Test ederken bilinmesi gerekenler

- **Bildirim gelmez.** FCM kimlik bilgisi yüklenmedi (Q32); standalone APK'da push kanalı
  sessizdir. Uygulama içi bildirim listesi çalışır, telefona düşen bildirim gelmez. Hata
  değil, eksik hesap.
- **Fotoğraflar tünel üzerinden gider.** Yükleme telefondan doğrudan MinIO tüneline
  çıkar; ikinci adres bunun için var. Fotoğraf yüklenmiyorsa önce tünel penceresine bak.
  (Tarayıcı tarafında aynı yol 13.4'e kadar CSP tarafından kesiliyordu — `connect-src`
  artık depolama origin'ini `S3_ENDPOINT`'ten türetiyor ve `e2e/attachment-upload.spec.ts`
  bunu koruyor.)
- **Tünel düşerse yığın kapanır.** Yeniden başlat, yeni adresi §3'teki alana yapıştır.
  Yeniden derlemene gerek yok.
- Tünel penceresi çökerse `mobile/eas.json` yamalı kalabilir:
  ```bash
  git checkout -- mobile/eas.json
  ```

---

## Neden böyle: iki seçeneğin maliyeti (13.4 kararı)

|                                     | **A — her turda yeniden derle**                            | **B — tek APK + çalışma anında adres**                        |
| ----------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------- |
| Tur başına süre                     | EAS kuyruğu + build **10–20 dk**, sonra indirme ve kurulum | tünel **~30 sn**, adresi yapıştır **~15 sn**                  |
| Tur başına build                    | 1                                                          | 0                                                             |
| Tünelin ayakta kalması gereken süre | kuyruk + build + kurulum + test (yarım saati aşar)         | yalnız test                                                   |
| Ertesi oturum                       | APK ölü, yeniden derle                                     | aynı APK çalışır                                              |
| Ek kod                              | yok                                                        | `mobile/src/api/server-address.ts` + giriş ekranında bir alan |
| Risk                                | yok                                                        | **alanın mağaza sürümüne sızması**                            |

**B seçildi.** A'nın maliyeti tekrar eden ve büyük: E6 bir turda bitmeyecek bir tur, ve her
düzeltme denemesi yeni bir build demek. Tünelin build kuyruğu boyunca ayakta kalma zorunda
olması ayrıca kırılgan — quick tunnel'ın düştüğü her an bir build'i çöpe atıyor.

B'nin tek gerçek riski kapatıldı: alan `__DEV__`'e değil **profil bayrağına** bağlı
(`EXPO_PUBLIC_ALLOW_SERVER_OVERRIDE`), çünkü `__DEV__` release bundle'da zaten `false` —
yani tam da ihtiyaç duyan build'de alanı kapatırdı, tersi ise production'da açardı.
`test/mobile-server-override.test.ts` bayrağın `production` profilinde **bulunmadığını**
iddia ediyor; kapalı olduğu hiçbir şeyce sınanmayan bir bayrak, bir merge sırasında kendini
açan bayraktır.

QR okutma yapılmadı: `expo-camera` bağımlılığı ve kamera izni, yapıştırmanın çözdüğü bir
sorun için fazla bedel. Adres panoya kopyalanabiliyor.

## Sınırlar

Bu **yalnız yerel test yolu**. `.env.example` ve `.env` `localhost` kalır
(`23-deployment-and-environments.md` §Configuration); tünel adresleri hiçbir dosyada
kalıcı değildir. Mağaza gönderimi ayrı bir kapı: `29` §F, F8–F11.
