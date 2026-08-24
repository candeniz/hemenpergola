/**
 * Transactional email and SMS bodies — `13-notifications.md` §Templates.
 *
 * Turkish, written rather than translated (the brief's audience is Turkish; English follows
 * when a second locale has real users). These are **not** next-intl messages: `I18N-01`
 * governs user-facing strings in the UI, and a mail body is composed on the server for a
 * recipient whose locale is a column on their row, not a URL segment.
 *
 * The brand arrives as a parameter (`brandName()` reads the catalogue's `brand.name` —
 * "Hemen Pergola" since Q1 closed 2026-08-24) rather than being hardcoded per template,
 * so a rename stays a one-entry change.
 */

type EmailBody = { subject: string; text: string }

export function emailVerificationEmail(link: string, brand: string): EmailBody {
  return {
    subject: 'E-posta adresinizi doğrulayın',
    text: [
      'Merhaba,',
      '',
      `${brand} hesabınızı oluşturdunuz. Aşağıdaki bağlantıya tıklayarak e-posta adresinizi doğrulayın:`,
      '',
      link,
      '',
      'Bağlantı 24 saat geçerlidir ve yalnızca bir kez kullanılabilir.',
      '',
      'Bu hesabı siz oluşturmadıysanız bu e-postayı yok sayabilirsiniz.',
    ].join('\n'),
  }
}

export function passwordResetEmail(link: string, brand: string): EmailBody {
  return {
    subject: 'Şifre sıfırlama bağlantısı',
    text: [
      'Merhaba,',
      '',
      `${brand} hesabınız için şifre sıfırlama talebinde bulunuldu. Yeni şifrenizi belirlemek için:`,
      '',
      link,
      '',
      'Bağlantı 1 saat geçerlidir ve yalnızca bir kez kullanılabilir.',
      '',
      'Şifrenizi sıfırladığınızda diğer tüm oturumlarınız kapatılır.',
      '',
      'Bu talebi siz yapmadıysanız hiçbir şey yapmanıza gerek yok; şifreniz değişmedi.',
    ].join('\n'),
  }
}

/**
 * Sent when an address that already has an account tries to register again.
 *
 * This is the other half of "registration does not disclose whether an email exists": the
 * response is identical either way, and the truth goes to the person who owns the address.
 */
export function accountAlreadyExistsEmail(link: string, brand: string): EmailBody {
  return {
    subject: 'Zaten bir hesabınız var',
    text: [
      'Merhaba,',
      '',
      `Bu e-posta adresiyle ${brand} üzerinde yeni bir hesap açılmaya çalışıldı, ancak zaten bir hesabınız var.`,
      '',
      'Şifrenizi hatırlamıyorsanız buradan sıfırlayabilirsiniz:',
      '',
      link,
      '',
      'Bu denemeyi siz yapmadıysanız bu e-postayı yok sayabilirsiniz.',
    ].join('\n'),
  }
}

/** `12` §Abuse controls: sent once per failure streak, on the fifth failure. */
export function lockoutNoticeEmail(brand: string): EmailBody {
  return {
    subject: 'Hesabınızda başarısız giriş denemeleri',
    text: [
      'Merhaba,',
      '',
      `${brand} hesabınıza art arda beş başarısız giriş denemesi yapıldı. Hesabınız kilitlenmedi, ancak sonraki denemeler kademeli olarak yavaşlatılıyor.`,
      '',
      'Bu denemeler size aitse yapmanız gereken bir şey yok.',
      'Değilse, şifrenizi değiştirmenizi öneririz.',
    ].join('\n'),
  }
}

export function invitationEmail(link: string, companyName: string, brand: string): EmailBody {
  return {
    subject: `${companyName} sizi ekibine davet etti`,
    text: [
      'Merhaba,',
      '',
      `${companyName}, ${brand} üzerindeki firma hesabına sizi davet etti. Daveti kabul etmek için:`,
      '',
      link,
      '',
      'Bağlantı 24 saat geçerlidir.',
    ].join('\n'),
  }
}

export function phoneOtpSms(code: string, brand: string): string {
  // Short on purpose: an SMS over 160 characters is billed as two.
  return `${brand} doğrulama kodunuz: ${code}. 5 dakika geçerlidir. Kodu kimseyle paylaşmayın.`
}

/* ── Verification decisions (task 2.4, `17-admin-system.md` §Manufacturer verification) ──
 *
 * One event per decision, and every decision gets one. The full notification catalogue is
 * Phase 7 (`13-notifications.md`); what matters now is that nobody discovers their company
 * was rejected by logging in and noticing.
 */

export function companyVerifiedEmail(companyName: string, brand: string): EmailBody {
  return {
    subject: `${companyName} doğrulandı`,
    text: [
      'Merhaba,',
      '',
      `${companyName} firmasının ${brand} üzerindeki başvurusu incelendi ve onaylandı.`,
      '',
      'Firmanız artık müşteri taleplerinde eşleşmeye açık. Panelinizden ürünlerinizi,',
      'fiyat listenizi ve hizmet bölgelerinizi tamamlayarak talep almaya başlayabilirsiniz.',
    ].join('\n'),
  }
}

export function companyRejectedEmail(
  companyName: string,
  reason: string,
  brand: string,
): EmailBody {
  return {
    subject: `${companyName} başvurusu hakkında`,
    text: [
      'Merhaba,',
      '',
      `${companyName} firmasının ${brand} üzerindeki başvurusu şu an için onaylanmadı.`,
      '',
      'Gerekçe:',
      reason,
      '',
      // `17`: rejection is not terminal, and saying so in the mail is the difference
      // between a door closing and a door that needs another push.
      'Bu karar kalıcı değildir. Eksikleri tamamlayıp belgelerinizi yeniden yükleyerek',
      'başvurunuzu tekrar değerlendirmeye gönderebilirsiniz.',
    ].join('\n'),
  }
}

export function documentsRequestedEmail(
  companyName: string,
  reason: string,
  brand: string,
): EmailBody {
  return {
    subject: `${companyName} için ek belge gerekiyor`,
    text: [
      'Merhaba,',
      '',
      `${companyName} firmasının ${brand} üzerindeki başvurusu inceleniyor. Devam edebilmemiz`,
      'için birkaç belgeye daha ihtiyacımız var.',
      '',
      'İstenen belgeler:',
      reason,
      '',
      'Başvurunuz beklemede kalmaya devam ediyor; belgeleri yükledikten sonra inceleme',
      'kaldığı yerden sürer.',
    ].join('\n'),
  }
}

export function companySuspendedEmail(
  companyName: string,
  reason: string,
  brand: string,
): EmailBody {
  return {
    subject: `${companyName} hesabı askıya alındı`,
    text: [
      'Merhaba,',
      '',
      `${companyName} firmasının ${brand} üzerindeki hesabı askıya alındı.`,
      '',
      'Gerekçe:',
      reason,
      '',
      'Askı süresince firmanız aramalarda ve eşleşmelerde görünmez, mevcut kayıtlarınıza',
      'erişiminiz salt okunur olarak devam eder.',
    ].join('\n'),
  }
}
