# Veri güvenliği beyanları — Apple "privacy nutrition label" + Google "Data safety"

**Türetilmiştir, uydurulmamıştır:** her satırın kaynağı `19-security-and-kvkk.md` ve
`04-data-model.md`'dir; forma girilecek cevap bu tablodur, tablo formdan sonra değişmez.
Formlar İngilizce sorar; satırlar iki dilde durur ki panelde çeviri uydurulmasın.

## Toplanan veri sınıfları

| Sınıf (Apple/Play adı)                           | Ne                                                                       | Kaynak model (`04`)            | Amaç                                         | Üçüncü tarafla paylaşım                                                                                  | Takip (tracking)? |
| ------------------------------------------------ | ------------------------------------------------------------------------ | ------------------------------ | -------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------- |
| Contact Info: Name / E-mail / Phone              | ad, e-posta, telefon                                                     | `User`                         | hesap; kabul SONRASI üreticiye iletişim      | **Yalnız** talebi kabul eden üreticiyle, açık onayla (`Consent`, `ContactDisclosure` — `19` §Disclosure) | hayır             |
| User Content: Photos                             | proje/teras fotoğrafları                                                 | `File`/`ProjectAttachment`     | talebi tarif etmek; kabul eden üretici görür | kabul eden üreticiyle                                                                                    | hayır             |
| User Content: Other (project, messages, reviews) | ölçüler, konum SEÇİMİ (il/ilçe — cihaz konumu DEĞİL), mesajlar, yorumlar | `Project`, `Message`, `Review` | eşleşme, süreç, güven                        | mesajlar karşı tarafla; yayınlanan yorum herkese                                                         | hayır             |
| Identifiers: Device ID                           | Expo push token                                                          | `PushToken`                    | bildirim iletimi                             | Expo push altyapısı (işleyici sıfatıyla)                                                                 | hayır             |
| Usage / Diagnostics                              | — toplanmaz —                                                            | —                              | —                                            | —                                                                                                        | —                 |
| Precise/Coarse Location (cihazdan)               | — toplanmaz — konum kullanıcı beyanıdır                                  | —                              | —                                            | —                                                                                                        | —                 |

Reklam yok, üçüncü taraf analitik yok, "tracking" (ATT anlamında, siteler-arası) yok.

## Play'in ek soruları

- **Şifreleme:** aktarımda TLS; parolalar argon2 ile saklanır (`12`).
- **Silme yolu (form URL ister):** `https://<alan-adi>/hesap/verilerim` — 10.2'nin akışı:
  dışa aktarma isteği + e-posta doğrulamalı silme (`19` "request → verification →
  anonymisation", Q30 kapalı). Uygulama içinden aynı hesap denetimlerine bağlantı verilir.
- **Veri silinebilir mi / hesapla birlikte mi:** evet; silme anonimleştirmedir ve yasal
  saklama kayıtları (onay, ifşa, ticari kayıt) kimliksizleştirilerek tutulur — beyan
  metninde bu açıkça yazılır (`ADR-011`).

## Bekleyenler

- Gizlilik metni URL'i: `29` **A5** — avukat onayı olmadan yayımlanmaz; form o gün doldurulur.
- Alan adı: `29` **C6** (canlı backend) ile birlikte kesinleşir.
