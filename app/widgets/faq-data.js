/**
 * faq-data.js — pre-canned bilingual Q&A for Ana, Credimed's only chat persona.
 *
 * Why a single persona: WhatsApp and Anthropic APIs both refuse HIPAA
 * BAAs, so any LLM-driven free-text channel where a patient might
 * volunteer PHI is a legal risk. Pre-canned answers + email
 * escalation keeps the UX helpful without ever shipping PHI to a
 * non-compliant vendor. One persona ("Ana") used everywhere also
 * means a consistent face the patient recognizes from landing
 * through claim tracking.
 *
 * Branding nuance: the chat header shows the short "Ana" for compact
 * UI; the opener line uses the full "Ana Lucía" once for humanization
 * (more memorable, more Latino, more healthcare-personal). The two
 * names refer to the same person.
 *
 * Catalog shape (per entry):
 *   { q_es, q_en, a_es, a_en, keywords[] }
 *
 * Matching strategy in ana.js:
 *   1. The user's question is normalized (lowercased, accents removed).
 *   2. We score each entry by how many of its keywords appear as
 *      whole-word substrings of the user's text. Highest non-zero
 *      score wins.
 *   3. If no entry scores > 0, we fall back to email escalation.
 *
 * Bilingual: every entry exposes both `q_es / a_es` and `q_en / a_en`.
 * The chat widget picks the language based on the first user message
 * (defaults to English).
 *
 * Keep this file conservative — every answer here ships to real
 * patients. When in doubt, leave it out and let the email path catch it.
 */

const SUPPORT_EMAIL = 'support@credimed.us';

const ANA_FAQ = [
  // ---- General — used pre-signup and on landing -----------------------
  {
    topic: 'general',
    q_es: '¿Cómo funciona Credimed?',
    q_en: 'How does Credimed work?',
    a_es: 'Te ayudamos a recuperar dinero de tu seguro dental PPO de US por trabajos hechos en México. Subes tu recibo + tu credencial del seguro, nosotros preparamos el claim, lo enviamos a tu aseguradora, y la aseguradora te paga directo a ti. Tú solo pagas nuestra tarifa una vez.',
    a_en: 'We help you recover money from your US dental PPO insurance for dental work done in Mexico. You upload your receipt + insurance card, we prepare and submit the claim to your carrier, and the carrier pays you directly. You only pay our fee once.',
    keywords: ['como', 'funciona', 'how', 'works', 'work', 'que', 'hacen', 'do']
  },
  {
    topic: 'general',
    q_es: '¿Cuánto cuesta?',
    q_en: 'How much does it cost?',
    a_es: 'Cobramos según la complejidad del claim: Standard $49, Plus $79, Premium $99. La complejidad la determina nuestro sistema basado en cuántos procedimientos, cuántos documentos, y la calidad del recibo. Una sola tarifa, sin comisión sobre tu reembolso.',
    a_en: 'We charge based on claim complexity: Standard $49, Plus $79, Premium $99. Complexity is set by our system based on number of procedures, documents, and receipt quality. One flat fee, no commission on your refund.',
    keywords: ['cuesta', 'precio', 'tarifa', 'fee', 'price', 'cost', 'how much', 'cuanto', 'cobran']
  },
  {
    topic: 'general',
    q_es: '¿Qué es la garantía 100% money-back?',
    q_en: 'What is the 100% money-back guarantee?',
    a_es: 'Si tu claim era elegible bajo tu plan y no logramos reembolso después del envío inicial + una resubmission gratis, te devolvemos el 100% del fee. El refund toma 5-10 días hábiles a tu método de pago original. Lee el detalle en el Service Agreement.',
    a_en: "If your claim was eligible under your plan and we couldn't get a refund after initial submission + one free resubmission, we return 100% of your fee. Refund processing takes 5-10 business days to your original payment method. See full detail in the Service Agreement.",
    keywords: ['money', 'back', 'garantia', 'refund', 'reembolso', 'guarantee', 'devuelven', 'devuelve']
  },
  {
    topic: 'general',
    q_es: '¿Es seguro? ¿Mi info está protegida?',
    q_en: 'Is it safe? Is my info protected?',
    a_es: 'Sí. Tu información médica está cifrada con AWS KMS (256-bit), comunicación HTTPS/TLS, y operamos bajo prácticas alineadas con HIPAA. Tenemos BAA firmado con AWS y Google Workspace. Nunca compartimos tu información con terceros excepto tu aseguradora.',
    a_en: 'Yes. Your medical info is encrypted with AWS KMS (256-bit), all communication is HTTPS/TLS, and we operate under HIPAA-aligned practices. We have BAA signed with AWS and Google Workspace. We never share your info with third parties except your insurer.',
    keywords: ['seguro', 'safe', 'hipaa', 'privacy', 'data', 'datos', 'proteg']
  },
  {
    topic: 'general',
    q_es: '¿Qué aseguradoras manejan?',
    q_en: 'What insurance carriers do you support?',
    a_es: 'Trabajamos con todas las PPO mayores en US: Delta Dental, Cigna, Aetna, MetLife, United Healthcare, Guardian, Blue Cross Blue Shield, y otros. Solo PPO — no aceptamos HMO ni Medicaid.',
    a_en: "We work with all major US PPO carriers: Delta Dental, Cigna, Aetna, MetLife, United Healthcare, Guardian, Blue Cross Blue Shield, and more. PPO only — we don't accept HMO or Medicaid.",
    keywords: ['aseguradora', 'insurance', 'carrier', 'delta', 'cigna', 'aetna', 'metlife', 'united', 'bcbs', 'ppo', 'hmo']
  },
  {
    topic: 'general',
    q_es: '¿Cuánto tarda todo el proceso?',
    q_en: 'How long does the whole process take?',
    a_es: 'Nosotros preparamos y enviamos tu claim en 24 horas. Tu aseguradora típicamente responde en 3-6 semanas (algunas hasta 8). Si te aprueban, el reembolso llega a tu cuenta en 3-7 días hábiles después.',
    a_en: 'We prepare and submit your claim within 24 hours. Your insurer typically responds in 3-6 weeks (some up to 8). If approved, the refund arrives in your account 3-7 business days after.',
    keywords: ['tarda', 'tiempo', 'time', 'long', 'cuanto', 'demora', 'tardan', 'cuando']
  },
  {
    topic: 'general',
    q_es: '¿Tengo que estar en Mexico?',
    q_en: 'Do I have to be in Mexico?',
    a_es: 'No. Solo necesitas haber tenido el trabajo dental hecho en México y tener tu recibo + credencial. El claim lo manejas desde donde estés, en cualquier momento dentro del periodo de cobertura de tu seguro (típicamente 12 meses desde el procedimiento).',
    a_en: "No. You just need to have had the dental work done in Mexico and have your receipt + insurance card. You handle the claim from anywhere, anytime within your insurer's claim window (typically 12 months from the procedure).",
    keywords: ['mexico', 'estar', 'donde', 'where', 'tengo', 'have']
  },

  // ---- Docs — onboarding, document upload, OCR -------------------------
  {
    topic: 'docs',
    q_es: '¿Qué documentos necesito subir?',
    q_en: 'What documents do I need to upload?',
    a_es: 'Tres cosas: (1) foto/PDF de tu credencial de seguro dental, ambos lados si es posible. (2) recibo del dentista en México con el desglose de procedimientos. (3) las radiografías que te tomaron — refuerzan el claim. JPG, PNG o PDF.',
    a_en: "Three things: (1) photo/PDF of your dental insurance card, both sides if possible. (2) dentist receipt from Mexico with itemized procedures. (3) any x-rays the dentist took — they strengthen the claim. JPG, PNG or PDF.",
    keywords: ['documento', 'document', 'subir', 'upload', 'archivo', 'file', 'papel', 'need', 'necesito', 'requier']
  },
  {
    topic: 'docs',
    q_es: '¿Por qué piden mi credencial de seguro?',
    q_en: 'Why do you need my insurance card?',
    a_es: 'Para identificar tu plan y calcular tu cobertura exacta. Sin la credencial no podemos saber qué procedimientos cubre tu plan ni el porcentaje de reembolso esperado.',
    a_en: "To identify your plan and calculate your exact coverage. Without the card we can't know which procedures your plan covers or the expected refund percentage.",
    keywords: ['credencial', 'card', 'insurance', 'porque', 'why', 'piden']
  },
  {
    topic: 'docs',
    q_es: 'Mi recibo está en español, ¿es problema?',
    q_en: 'My receipt is in Spanish, is that a problem?',
    a_es: 'No, lo traducimos nosotros. Súbelo tal como está y nuestro equipo se encarga de la traducción al inglés y de mapear los procedimientos a códigos CDT que tu aseguradora reconoce.',
    a_en: "No, we translate it. Upload it as-is and our team handles the English translation and maps the procedures to CDT codes your insurer recognizes.",
    keywords: ['espanol', 'spanish', 'idioma', 'language', 'traduc', 'translate']
  },
  {
    topic: 'docs',
    q_es: '¿Qué pasa después de subir mis documentos?',
    q_en: 'What happens after I upload my documents?',
    a_es: 'Nuestro sistema procesa el recibo (~2 minutos), te muestra el estimado de reembolso, eliges plan, firmas el agreement, pagas, y nosotros enviamos el claim a tu aseguradora dentro de 24 horas.',
    a_en: 'Our system processes the receipt (~2 minutes), shows you the refund estimate, you choose a plan, sign the agreement, pay, and we submit the claim to your insurer within 24 hours.',
    keywords: ['despues', 'after', 'siguiente', 'next', 'que pasa', 'what happens']
  },
  {
    topic: 'docs',
    q_es: '¿Puedo editar mi claim después de enviarlo?',
    q_en: 'Can I edit my claim after submitting?',
    a_es: 'Una vez enviado a la aseguradora no podemos modificarlo, pero si recibes alguna comunicación de la aseguradora pidiendo info adicional, te contactamos por email para ayudarte. Para correcciones antes del envío, escríbenos a ' + SUPPORT_EMAIL + '.',
    a_en: "Once submitted to the insurer we can't modify it, but if the insurer requests additional info we email you to help. For pre-submission corrections, email " + SUPPORT_EMAIL + '.',
    keywords: ['editar', 'edit', 'cambiar', 'change', 'modificar', 'modify', 'corregir']
  },

  // ---- Pricing — plan tiers, fees, payment, agreement ------------------
  {
    topic: 'pricing',
    q_es: '¿Por qué me tocó plan Standard / Plus / Premium?',
    q_en: 'Why did I get Standard / Plus / Premium?',
    a_es: 'Asignamos plan según la complejidad de tu claim: Standard ($49) si es simple — pocos procedimientos, recibo claro. Plus ($79) si hay múltiples procedimientos o el recibo necesita más trabajo. Premium ($99) si hay códigos ambiguos, muchos procedimientos, o calidad de recibo baja.',
    a_en: 'We assign plan by claim complexity: Standard ($49) for simple claims — few procedures, clear receipt. Plus ($79) for multiple procedures or receipts needing more work. Premium ($99) for ambiguous codes, many procedures, or low receipt quality.',
    keywords: ['plan', 'standard', 'plus', 'premium', 'asign', 'tier']
  },
  {
    topic: 'pricing',
    q_es: '¿Qué incluye mi plan?',
    q_en: 'What does my plan include?',
    a_es: 'Todos los planes incluyen: preparación del claim, traducción español→inglés, mapeo a códigos CDT, envío a tu aseguradora, seguimiento, y una resubmission gratis si te niegan. Plus y Premium incluyen revisión de códigos más detallada.',
    a_en: 'All plans include: claim preparation, Spanish→English translation, CDT code mapping, submission to your insurer, follow-up, and one free resubmission if denied. Plus and Premium include more detailed code review.',
    keywords: ['incluye', 'include', 'features']
  },
  {
    topic: 'pricing',
    q_es: '¿Es real lo del fee de $19 por resubmission?',
    q_en: 'Is the $19 resubmission fee real?',
    a_es: 'Sí. La primera resubmission es gratis. Si tu aseguradora te niega de nuevo y quieres reintentar, cada submission adicional es $19. Solo cobramos si tú decides reintentar — no es automático.',
    a_en: 'Yes. The first resubmission is free. If your insurer denies again and you want to retry, each additional submission is $19. We only charge if you choose to retry — never automatic.',
    keywords: ['resubmission', 'resub', '19', 'reintent', 'retry']
  },

  // ---- Status — claim tracking, decisions, denials ---------------------
  {
    topic: 'status',
    q_es: '¿Qué significan los status de mi claim?',
    q_en: 'What do the claim statuses mean?',
    a_es: 'Submitted: enviado a tu aseguradora. In-review: la aseguradora lo está analizando. Approved: aprobado, te van a pagar. Paid: el reembolso ya salió. Denied: negado — te contactamos para opciones (resubmission gratis, money-back si aplica).',
    a_en: 'Submitted: sent to your insurer. In-review: insurer is analyzing it. Approved: approved, payment coming. Paid: refund issued. Denied: declined — we contact you with options (free resubmission, money-back if eligible).',
    keywords: ['status', 'estado', 'significa', 'mean', 'submitted', 'review', 'approved', 'paid', 'denied']
  },
  {
    topic: 'status',
    q_es: '¿Cómo me pagan el reembolso?',
    q_en: 'How do I get paid?',
    a_es: 'Tu aseguradora te paga a ti directo, no a Credimed. Algunas mandan cheque por correo, otras hacen depósito directo según el método que tengan registrado contigo. Llega 3-7 días hábiles después de aprobado.',
    a_en: 'Your insurer pays you directly, not Credimed. Some send a check by mail, others use direct deposit based on the method they have on file. Arrives 3-7 business days after approval.',
    keywords: ['pagan', 'pay', 'pago', 'payment', 'depos', 'cheque', 'check']
  },
  {
    topic: 'status',
    q_es: '¿Qué hago si mi aseguradora me llama pidiendo info?',
    q_en: 'What if my insurer calls me asking for info?',
    a_es: 'Eso es normal — algunas aseguradoras verifican datos directamente contigo. Confirma la info que pidan basándote en tu claim. Si necesitas que nosotros respondamos algo técnico, escríbenos a ' + SUPPORT_EMAIL + ' con el detalle.',
    a_en: "That's normal — some insurers verify data directly with you. Confirm the info they ask based on your claim. If you need us to answer something technical, email " + SUPPORT_EMAIL + ' with details.',
    keywords: ['llama', 'call', 'pide', 'ask', 'verific']
  },
  {
    topic: 'status',
    q_es: 'Mi claim fue denegado, ¿qué hago?',
    q_en: 'My claim was denied, what do I do?',
    a_es: 'Lo siento que pasó eso. Tienes dos opciones: (1) resubmission gratis si encontramos un ángulo nuevo. (2) si tu claim era elegible bajo tu plan, aplica el 100% money-back. Por favor escríbenos a ' + SUPPORT_EMAIL + ' con tu claim ID y un asesor humano revisa tu caso específico.',
    a_en: "Sorry that happened. You have two options: (1) free resubmission if we find a new angle. (2) if your claim was eligible under your plan, the 100% money-back applies. Please email " + SUPPORT_EMAIL + " with your claim ID so a human advisor reviews your specific case.",
    keywords: ['denegado', 'denied', 'denegaron', 'rechaz', 'reject', 'no aprobaron']
  }
];

window.CredimedFAQ = {
  ana: ANA_FAQ,
  SUPPORT_EMAIL: SUPPORT_EMAIL
};
