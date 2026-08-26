# Sürümleme ve imzalama yolları

Anahtar üretilmedi ve **bu depoya asla girmeyecek** — depo public, `.gitignore`
`*.keystore`, `*.jks`, `*.p8`, `*.p12`, `*.mobileprovision` girdilerini 11.2'den beri
taşıyor; geçmişe bir kez giren anahtar, onu silen force-push'tan uzun yaşar.

## Sürümleme

- **Marketing sürümü** `app.json` → `expo.version` (şu an `0.1.0`): kullanıcıya görünen
  tek numara; kapsamlı ekleme minor, düzeltme patch. `eas.json` →
  `cli.appVersionSource: "local"`: bu dosya tek kaynak, EAS sunucusu numara uydurmaz.
- **Build numaraları** `ios.buildNumber` / `android.versionCode` (şu an `1`): production
  profili `autoIncrement: true` ile her mağaza build'inde artırır; elle dokunulmaz.

## İmzalama — yol, anahtar değil

- **Android:** ilk `eas build -p android --profile production` koşusunda EAS bir keystore
  üretip **EAS hesabında** saklar (önerilen yol). Yerel keystore tercih edilirse dosya
  `.gitignore`'un tuttuğu uzantılarda kalır ve parolası bir parola kasasına yazılır.
  Standalone push için FCM anahtarı da EAS'e yüklenir (Q32) — dosya olarak repoya değil.
- **iOS:** sertifika ve provisioning profillerini `eas credentials` Apple Developer
  hesabıyla üretir ve EAS'te saklar; `.p8`/`.p12` indirilse bile ignore listesindedir.
- **Kural:** kimlik bilgisi = hesap + kasa. Depo yalnız _yolları_ bilir.

## Profil → amaç

| `eas.json` profili | Ne için                                         | Çıktı                        |
| ------------------ | ----------------------------------------------- | ---------------------------- |
| `development`      | geliştirme istemcisi, `localhost` API           | internal dağıtım             |
| `preview`          | cihazda elden paylaşılan deneme                 | Android APK, internal        |
| `production`       | mağaza gönderimi (F-satırları + A5/C6 açılınca) | AAB / IPA, otomatik build no |
