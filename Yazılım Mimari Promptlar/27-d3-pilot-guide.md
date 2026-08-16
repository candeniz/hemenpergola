# 27 — D3 pilot session: fiyat listesi

`26-execution-plan.md` §Phase 3, madde 3.8. **Bu ekran indiği hafta gerçek bir üreticinin
önüne konulmalı.** Bu sayfa o oturumu yürüten kişi içindir — bir sayfa, oturum sırasında
açık durur.

Oturumun amacı, ekranın çalıştığını doğrulamak **değil**. Amaç şu: bir üretici, kendi
fiyatlarını yardım almadan girebiliyor mu? `26` §Risk register projedeki en büyük riski
buraya koyuyor — *veri girişi zahmetli gelirse fiyat yok, fiyat yoksa ürün yok.*

## Oturumdan önce

```bash
docker compose up -d && pnpm seed demo && pnpm dev
```

| | |
|---|---|
| Adres | `http://localhost:3000/giris` |
| E-posta | `owner@marmaracam.local` |
| Parola | `phase3-pilot-manufacturer-password` |
| Firma | Marmara Cam Sistemleri (İstanbul, doğrulanmış) |

Hesap **bilerek eksik bırakıldı**: ürünler işaretli, hizmet bölgesi tanımlı, **fiyat listesi
yok**. Ölçmek istediğimiz şey tam olarak sıfırdan fiyat listesi oluşturmak.

Giriş yaptıktan sonra sol menüden **Fiyatlandırma**.

## Üreticiden ne isteniyor

Tek cümleyle söyleyin, sonra susun:

> "Bu ekranı kullanarak kendi gerçek fiyatlarınızı girin. Ben yardım etmeyeceğim; nerede
> takıldığınızı not alacağım."

**Yol göstermeyin.** Bir alanı açıklamak zorunda kaldığınız her an, o alanın kendini
açıklamadığının kanıtıdır — ve not edilecek şey de budur.

## Nerede durduğunu not edin

Her adım için: **kendi başına yaptı / duraksadı / soru sordu / yapamadı.**

| # | Adım | Not |
|---|---|---|
| 1 | Boş taslak mı, kopyalama mı seçti | |
| 2 | Birim fiyatı hangi birimde anladı (m²/metre/adet) | |
| 3 | Asgari proje bedelini doğru anladı mı | |
| 4 | Kurulum bedelini ayrı bir kalem olarak bekliyor muydu | |
| 5 | Opsiyon fiyat tipini (sabit / m² / metre / adet / yüzde) seçebildi mi | |
| 6 | Bölgesel farkı kendi kendine buldu mu | |
| 7 | Kural ekledi mi; eşiğin birimini anladı mı | |
| 8 | Simülatörü kendiliğinden çalıştırdı mı | |
| 9 | Simülatördeki dökümü okuyabildi mi | |
| 10 | Yayımlamadan önce kontrol etti mi | |
| 11 | Toplam süre | |

**Bir şeyi mutlaka ölçün: 1. adımdan 10. adıma kadar geçen süre.** On dakikanın üzerindeyse
ekran çok ağır demektir.

## Bu oturumda cevaplanabilecek açık sorular

`25-progress.md` §Open questions'daki sorular. Cevap alırsanız oraya yazın — tahmin
yazmayın, boş bırakın.

| # | Soru | Nasıl sorulur |
|---|---|---|
| **Q11** | Ürün başına gerçek attribute seti doğru mu | "Bu ürünün eksik bir özelliği var mı? Sizin sattığınız ama burada olmayan?" |
| **Q12** | Opsiyonlar gerçekten opsiyon mu, yoksa varyant mı | "Bunu ayrı fiyatlıyor musunuz, yoksa ürünün içinde mi?" |
| **Q13** | Ölçü aralıkları gerçekçi mi | "En küçük ve en büyük hangi ölçüde iş yapıyorsunuz?" |
| **Q14** | Fiyat birimi m² mi, başka bir şey mi | 2. adımda zaten görülecek — sorulmadan gözlenir |
| **Q15** | Asgari proje bedeli gerçek bir kavram mı | "Altına inmediğiniz bir tutar var mı?" |
| **Q16** | Bölgesel fark nasıl hesaplanıyor | "Kocaeli'ye iş yapsanız fiyat nasıl değişir? Sabit mi, yüzde mi?" |
| **Q17** | Hacim indirimi eşikleri | "Büyük işte indirim yapar mısınız? Hangi ölçüden sonra?" |
| **Q18** | Kurulum ayrı mı fiyatlanıyor | "Montaj fiyata dahil mi?" |

**En değerli çıktı, üreticinin "bunu böyle yapmıyoruz" dediği yerdir.** Onu tam cümleyle
yazın. Bizim modelimizin yanlış olduğu nokta odur ve düzeltilecek yer koddan önce
`04-data-model.md`'dir.

## Oturumdan sonra

1. Tabloyu `25-progress.md`'ye tarihli bir kayıt olarak ekleyin.
2. Cevaplanan Q11–Q18'i kapatın; cevaplanmayanları **açık bırakın**.
3. Yeni çelişki çıkarsa `24-decisions-log.md`'ye ADR yazın — kodda yorum satırına değil.

## Bilinmeyenler — üreticiye bunları söyleyin

Dürüst olmak, oturumda güven kazandırır ve yanlış beklenti üretmez:

- **KDV hiçbir yerde yok.** Tahminler net (`ADR-007`). KDV yalnızca gerçek teklifte çıkar.
- **Müşteri kalem kalem fiyat görmez**, yalnızca yuvarlanmış bir aralık (`ADR-006`). Fiyat
  listesi rakiplere açılmaz.
- **Yayımlanan liste değiştirilemez.** Değiştirmek, yeni sürüm yayımlamak demektir; eski
  müşteri tahminleri olduğu gibi kalır.
- **Konfigüratör kural motoru yok** (`ADR-008`). "Şu seçilirse şu zorunlu" gibi kurallar V1'de
  yok; üretici bunu isterse not edin, bir ADR'yi tetikler.
