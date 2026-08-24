/**
 * The versioned consent texts — `19` §Consent: *"The consent text lives in the repo,
 * versioned; changing it creates a new `textVersion`."*
 *
 * The version is what `Consent.textVersion` stores and what makes the row evidence: it
 * names exactly which words the customer agreed to. The words themselves live in the i18n
 * catalogues (`consent.contactSharing.*`) so both locales render them; **changing the
 * meaning of the text means bumping this constant**, not editing in place — an edited text
 * under an old version would falsify every consent row that points at it.
 *
 * The text must say plainly that revocation stops future disclosures and cannot recall
 * what was already shared (`11` §Contact disclosure). The i18n body does.
 */
export const CONTACT_SHARING_TEXT_VERSION = '2026-08-24.v1'
