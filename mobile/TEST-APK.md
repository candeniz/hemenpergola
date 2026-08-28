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

**Bu pencere açık kalacak.** Kapanırsa adres ölür ve APK'daki gömülü adres hiçbir yere
çıkmaz.

> Tünel açıkken yerel sunucun internete açıktır. Yalnız demo verisiyle çalış, iş bitince
> Ctrl+C ile kapat.

---

## 2 · Her turda: APK'yı derle

**Tünel penceresi açıkken**, ikinci bir pencerede:

```bash
cd mobile
```

```bash
eas build -p android --profile preview
```

Sıra önemli: adres her açılışta değişiyor ve `eas build` onu `eas.json`'dan **o an**
okuyor. Tünel kapalıyken alınan APK `http://localhost:3000` ile gömülür ve telefonda
çalışmaz.

- İlk koşuda EAS bir Android keystore üretmeyi teklif eder → **evet**. Anahtar EAS
  hesabında kalır, depoya inmez.
- "You have uncommitted changes" uyarısı beklenen: `eas.json`'daki adres ve
  `app.json`'daki `versionCode`. Devam et; script çıkarken `eas.json`'ı geri alır.
- Build bulutta koşar (~10–20 dk). Biten build'in APK bağlantısını terminal ve
  https://expo.dev/accounts/<hesap>/projects/hemen-pergola/builds verir.

---

## 3 · Telefona kur

1. APK bağlantısını telefonun tarayıcısında aç (ya da QR'ı okut) ve indir.
2. Android "bilinmeyen kaynak" uyarısı verir: **Ayarlar → İzin ver** — izin indirmeyi
   yapan uygulamaya (Chrome / Dosyalar) verilir, tek seferlik.
3. İndirilenler → APK'ya dokun → **Kur**.

Aynı `versionCode` ile ikinci kez kurmaya çalışırsan Android reddeder; `preview` profili
her build'de numarayı artırdığı için üst üste kurulum sorunsuz (`store/surumleme-ve-imza.md`).

---

## 4 · Sırayla, her turda

```
1. "Hemen Pergola - tunel.cmd"      (aç, açık bırak)
2. cd mobile && eas build -p android --profile preview
3. APK'yı telefona indir + kur
4. Uygulamayı aç, demo hesabıyla giriş yap
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
- **Her tur yeni adres, yeni APK.** Sabit bir adres için Cloudflare/ngrok hesabı ve alan
  adı gerekir; test turu bunu hak etmiyor.
- Tünel penceresi çökerse `mobile/eas.json` yamalı kalabilir:
  ```bash
  git checkout -- mobile/eas.json
  ```

## Sınırlar

Bu **yalnız yerel test yolu**. `.env.example` ve `.env` `localhost` kalır
(`23-deployment-and-environments.md` §Configuration); tünel adresleri hiçbir dosyada
kalıcı değildir. Mağaza gönderimi ayrı bir kapı: `29` §F, F8–F11.
