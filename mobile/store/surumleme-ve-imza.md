# Sürümleme ve imzalama yolları

Anahtar üretilmedi ve **bu depoya asla girmeyecek** — depo public, `.gitignore`
`*.keystore`, `*.jks`, `*.p8`, `*.p12`, `*.mobileprovision` girdilerini 11.2'den beri
taşıyor; geçmişe bir kez giren anahtar, onu silen force-push'tan uzun yaşar.

## Sürümleme

- **Marketing sürümü** `app.json` → `expo.version` (şu an `0.1.0`): kullanıcıya görünen
  tek numara; kapsamlı ekleme minor, düzeltme patch. `eas.json` →
  `cli.appVersionSource: "local"`: bu dosya tek kaynak, EAS sunucusu numara uydurmaz.
- **Build numaraları** `ios.buildNumber` / `android.versionCode` (şu an `1`): production
  **ve** `preview` profilleri `autoIncrement: true` ile her build'de artırır; elle
  dokunulmaz. `preview` de artırıyor, çünkü aynı `versionCode` ile ikinci bir test APK'sı
  telefonda "daha yeni sürüm değil" diye takılıyor ve test eden kişi bir önceki turu
  yeniden kuruyor. Numara `app.json`'da yerelde artar (`appVersionSource: "local"`), yani
  build'den sonra `app.json` değişmiş görünür — bu beklenen, commit'lenir.

## İmzalama — yol, anahtar değil

- **Android:** ilk `eas build -p android --profile production` koşusunda EAS bir keystore
  üretip **EAS hesabında** saklar (önerilen yol). Yerel keystore tercih edilirse dosya
  `.gitignore`'un tuttuğu uzantılarda kalır ve parolası bir parola kasasına yazılır.
  Standalone push için FCM anahtarı da EAS'e yüklenir (Q32) — dosya olarak repoya değil.
  `expo-notifications` eklentisi standalone build'e bildirim ikonunu, rengini ve Android
  kanal altyapısını kimlik bilgisi OLMADAN kurar; FCM anahtarının tek işi teslimattır —
  anahtar yokken build alınır, bildirim gelmez (Q32).
- **iOS:** sertifika ve provisioning profillerini `eas credentials` Apple Developer
  hesabıyla üretir ve EAS'te saklar; `.p8`/`.p12` indirilse bile ignore listesindedir.
- **Kural:** kimlik bilgisi = hesap + kasa. Depo yalnız _yolları_ bilir.

## Profil → amaç

| `eas.json` profili | Ne için                                         | Çıktı                        |
| ------------------ | ----------------------------------------------- | ---------------------------- |
| `development`      | geliştirme istemcisi, `localhost` API           | internal dağıtım             |
| `preview`          | cihazda elden paylaşılan deneme                 | Android APK, internal        |
| `production`       | mağaza gönderimi (F-satırları + A5/C6 açılınca) | AAB / IPA, otomatik build no |

**`preview` APK'sında bildirim gelmez** — FCM kimlik bilgisi yüklenmediği için (Q32) push
kanalı standalone build'de sessizdir; uygulamanın geri kalanı normal çalışır, bu bir hata
değil eksik hesaptır (`mobile/src/push/register.ts` sessizce geçer, `mobile/TEST-APK.md`).

`preview` profilinin `env.EXPO_PUBLIC_API_URL` değeri build anında APK'ya gömülür; commit'li
değer `http://localhost:3000`'dir ve telefonda çalışmaz. `scripts/tunnel.mjs` build sırasında
o turun adresini yazar, tur bitince geri alır — ama artık **zorunlu değil**: 13.4'ten beri
`preview` ve `development` profilleri `EXPO_PUBLIC_ALLOW_SERVER_OVERRIDE=1` taşıyor ve adres
giriş ekranındaki alandan çalışma anında değiştirilebiliyor, yani APK bir kez derlenir
(`mobile/TEST-APK.md`). `production` bu bayrağı **taşımaz** ve
`test/mobile-server-override.test.ts` bunu iddia eder: mağaza sürümünde uygulamayı yabancı
bir sunucuya yönlendirebilen bir alan, kimlik bilgisini o sunucuya teslim eder.

## Bağımlılık sürümleri — SDK ne diyorsa o, bir istisnayla

`npx expo install --check` (ya da `pnpm --filter mobile run doctor`) Expo SDK 57'nin
beklediği sürümleri söyler ve depo onlara hizalıdır. Bu bir stil tercihi değil: ilk
`preview` build'i tam olarak bu yüzden düştü — `expo-modules-core` `WorkletRuntime::executeSync`
çağırıyordu, kurulu `react-native-worklets` onu dışa aktarmıyordu, ve `gradlew` içinde
patladı. İkisi de SDK 57'nin içindeydi; sapma yama seviyesindeydi. Bunu bir daha bulut
build'i yakarak öğrenmemek için `expo-doctor` CI'nın mobil adımında koşuyor.

**Tek dışlama: `typescript`.** Doctor `~6.0.3` istiyor, depo `5.9.3`'te ve bu **kök
workspace'in kararı**. Bir TypeScript major'ı web'i, `src/` altındaki her şeyi, testleri ve
CI'yı ilgilendirir; mobil paketin onu bir yan etki olarak sürüklemesi, kararı veren yerin
dışında vermek olurdu. `mobile/package.json`'daki `expo.install.exclude` bunu kayda geçirir,
doctor da artık bu yüzden yeşil kalır — sarı bırakılmış bir uyarı değil, yazılmış bir karar.
TS 6 geçişi `25-progress.md` §Open questions'ta Q35 olarak duruyor.

Komut, `run` ile: `pnpm doctor` pnpm'in yerleşik komutu olduğu için script'i gölgeler, ve
script'e `expo-doctor` adı verilemez — doctor'ın kendisi `node_modules/.bin` ile çakışan
script adını hata sayıyor.

## Native bir peer ağaca giriyorsa beyan edilir

**Bu projenin kuralı, iki bulut build'i yakarak öğrenildi:** `mobile/package.json`'da
beyan edilmemiş bir native modül, sürümü hiç kimse tarafından denetlenmeyen bir modüldür.

İkinci `preview` build'i de birincisiyle aynı yerde öldü —
`expo-modules-core/.../worklets/WorkletJSCallInvoker.cpp:27`, `no member named 'executeSync'`.
Sebep 13.6b'de kapatılmamıştı çünkü `expo doctor` yeşildi ve **haklıydı**: doctor beyan
edilmiş bağımlılıkları denetler. `react-native-worklets` ağaca `expo-modules-core`'un
_opsiyonel peer_'ı olarak girmişti, `react-native-reanimated` ise
`react-native-drawer-layout`'un **zorunlu** peer'ı olarak (`>= 2.0.0`) — ikisi de beyan
edilmemişti, ikisini de pnpm "aralığı sağlayan en yeni" diye seçmişti, ve denetleyecek bir
kayıt yoktu.

İkisi de artık beyan edilmiş, `expo/bundledNativeModules.json`'ın pinlediği **tam**
sürümlerde (`react-native-reanimated@4.5.1`, `react-native-worklets@0.10.1`) — tilde ile
değil, çünkü `~4.5.1` 4.5.5'e çözülüyor ve native modülde yama farkı da bir ABI farkıdır.

`scripts/check-native-peers.mjs` bunun kalıcı bekçisi: derlenecek C++'ı okuyor,
`expo-modules-core`'un çağırdığı her `WorkletRuntime::` sembolünün worklets başlıklarında
bildirildiğini ve hiçbir native modülün iki kopyasının erişilebilir olmadığını doğruluyor.
`pnpm --filter mobile run doctor` ikisini birden koşar; CI'da aynı adımda.

**Doctor'ın "React Native Directory" kontrolü kapatıldı** (`expo.doctor.reactNativeDirectoryCheck`).
Üçüncü taraf bir API'ye çıkıyor ve bu turda bir kez `unexpected server response` verdi;
artık CI'yı kapatan bir adım olduğu için, değişiklikle ilgisiz bir sebeple kırmızıya dönen
bir kapı olurdu — ve okunmayan bir uyarı tam olarak iki build'i öldüren şeydi. Kaybedilen
sinyal küçük: bağımlılık listesi baştan sona Expo'nun kendi paketleri, ve sürümlerini
doctor'ın sürüm kontrolü ile yukarıdaki script zaten denetliyor.

`expo-doctor` **tam sürüme sabit** (`1.20.4`, caret yok): CI'yı kapatan aracın kendisi
habersiz güncellenmemeli.
