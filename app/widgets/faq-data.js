/**
 * faq-data.js — pre-canned bilingual Q&A per chat persona.
 *
 * Replaces the live LLM agent (Sofia/Ana/Elena/Marco) with a static
 * keyword-matcher. Why: WhatsApp and Anthropic APIs both refuse to
 * sign HIPAA BAAs, so any free-text channel where a patient can
 * volunteer PHI is a legal risk. Pre-canned answers + email escalation
 * keeps the experience helpful without ever shipping PHI to a
 * non-compliant vendor.
 *
 * Each persona's catalog has the same shape:
 *   {
 *     quickReplies: [{ q, a, keywords }],   // shown as buttons up top
 *     fallbacks: [...]                       // matched on free typing
 *   }
 *
 * Matching strategy:
 *   1. The user's question is normalized (lowercased, accents removed).
 *   2. We score each entry by how many of its keywords appear as
 *      whole-word substrings of the user's text. Highest non-zero
 *      score wins.
 *   3. If no entry scores > 0, we fall back to the email-escalation
 *      message handled by agent-chat.js.
 *
 * Bilingual: each entry exposes both `q_es / a_es` and `q_en / a_en`.
 * The chat widget picks the language based on the first user message
 * (or the page's `lang` attribute as a tiebreaker).
 *
 * Keep this file conservative — every answer here ships to real
 * patients. When in doubt, leave it out and let the email path catch it.
 */

const SUPPORT_EMAIL = 'support@credimed.us';

// Helpers used by every catalog ----------------------------------------

function makeFAQ(entries) {
  return entries.map((e) => ({
    q_es: e.q_es,
    q_en: e.q_en,
    a_es: e.a_es,
    a_en: e.a_en,
    keywords: e.keywords || []
  }));
}

// SOFIA — landing page, anonymous visitor (pre-signup) -----------------

const SOFIA_FAQ = makeFAQ([
  {
    q_es: '¿Cómo funciona Credimed?',
    q_en: 'How does Credimed work?',
    a_es: 'Te ayudamos a recuperar dinero de tu seguro dental PPO de US por trabajos hechos en México. Subes tu recibo + tu credencial del seguro, nosotros preparamos el claim, lo enviamos a tu aseguradora, y la aseguradora te paga directo a ti. Tú solo pagas nuestra tarifa una vez.',
    a_en: 'We help you recover money from your US dental PPO insurance for dental work done in Mexico. You upload your receipt + insurance card, we prepare and submit the claim to your carrier, and the carrier pays you directly. You only pay our fee once.',
    keywords: ['como', 'funciona', 'how', 'works', 'work', 'que', 'hacen', 'do']
  },
  {
    q_es: '¿Cuánto cuesta?',
    q_en: 'How much does it cost?',
    a_es: 'Cobramos según la complejidad del claim: Standard $49, Plus $79, Premium $99. La complejidad la determina nuestro sistema basado en cuántos procedimientos, cuántos documentos, y la calidad del recibo. Una sola tarifa, sin comisión sobre tu reembolso.',
    a_en: 'We charge based on claim complexity: Standard $49, Plus $79, Premium $99. Complexity is set by our system based on number of procedures, documents, and receipt quality. One flat fee, no commission on your refund.',
    keywords: ['cuesta', 'precio', 'tarifa', 'fee', 'price', 'cost', 'how much', 'cuanto', 'cobran']
  },
  {
    q_es: '¿Qué es la garantía 100% money-back?',
    q_en: 'What is the 100% money-back guarantee?',
    a_es: 'Si tu claim es elegible bajo tu plan y no logramos que te reembolsen, te devolvemos el 100% de tu fee. Aplica cuando: el procedimiento está cubierto por tu plan, sigues nuestras instrucciones de submission, y nos das los documentos que pedimos. Lee el detalle en el Service Agreement.',
    a_en: "If your claim is eligible under your plan and we can't get you reimbursed, we refund 100% of your fee. It applies when: the procedure is covered by your plan, you follow our submission instructions, and you provide the documents we request. See full detail in the Service Agreement.",
    keywords: ['money', 'back', 'garantia', 'refund', 'reembolso', 'guarantee', 'devuelven', 'devuelve']
  },
  {
    q_es: '¿Es seguro? ¿Mi info está protegida?',
    q_en: 'Is it safe? Is my info protected?',
    a_es: 'Sí. Tu información médica está cifrada con AWS KMS (256-bit), comunicación HTTPS/TLS, y operamos bajo prácticas alineadas con HIPAA. Tenemos BAA firmado con AWS y Google Workspace. Nunca compartimos tu información con terceros excepto tu aseguradora.',
    a_en: 'Yes. Your medical info is encrypted with AWS KMS (256-bit), all communication is HTTPS/TLS, and we operate under HIPAA-aligned practices. We have BAA signed with AWS and Google Workspace. We never share your info with third parties except your insurer.',
    keywords: ['seguro', 'safe', 'hipaa', 'privacy', 'data', 'datos', 'proteg']
  },
  {
    q_es: '¿Qué aseguradoras manejan?',
    q_en: 'What insurance carriers do you support?',
    a_es: 'Trabajamos con todas las PPO mayores en US: Delta Dental, Cigna, Aetna, MetLife, United Healthcare, Guardian, Blue Cross Blue Shield, y otros. Solo PPO — no aceptamos HMO ni Medicaid.',
    a_en: 'We work with all major US PPO carriers: Delta Dental, Cigna, Aetna, MetLife, United Healthcare, Guardian, Blue Cross Blue Shield, and more. PPO only — we don\'t accept HMO or Medicaid.',
    keywords: ['aseguradora', 'insurance', 'carrier', 'delta', 'cigna', 'aetna', 'metlife', 'united', 'bcbs', 'ppo', 'hmo']
  },
  {
    q_es: '¿Cuánto tarda el proceso?',
    q_en: 'How long does it take?',
    a_es: 'Nosotros preparamos y enviamos tu claim en 24 horas. Tu aseguradora típicamente responde en 3-6 semanas. Si te aprueban, el reembolso llega a tu cuenta en 3-7 días hábiles después.',
    a_en: 'We prepare and submit your claim within 24 hours. Your insurer typically responds in 3-6 weeks. If approved, the refund arrives in your account 3-7 business days after.',
    keywords: ['tarda', 'tiempo', 'time', 'long', 'cuanto', 'demora', 'tardan', 'cuando']
  },
  {
    q_es: '¿Qué documentos necesito?',
    q_en: 'What documents do I need?',
    a_es: 'Solo dos cosas: (1) foto de tu credencial de seguro dental US, (2) recibo del dentista en México con desglose de procedimientos. Si tu recibo está en español, nosotros lo traducimos.',
    a_en: 'Just two things: (1) photo of your US dental insurance card, (2) receipt from your dentist in Mexico with itemized procedures. If your receipt is in Spanish, we translate it.',
    keywords: ['documento', 'document', 'papel', 'necesito', 'need', 'requier', 'subir', 'upload']
  },
  {
    q_es: '¿Tengo que estar en Mexico?',
    q_en: 'Do I have to be in Mexico?',
    a_es: 'No. Solo necesitas haber tenido el trabajo dental hecho en México y tener tu recibo + credencial. El claim lo manejas desde donde estés, en cualquier momento dentro del periodo de cobertura de tu seguro (típicamente 12 meses desde el procedimiento).',
    a_en: 'No. You just need to have had the dental work done in Mexico and have your receipt + insurance card. You handle the claim from anywhere, anytime within your insurer\'s claim window (typically 12 months from the procedure).',
    keywords: ['mexico', 'estar', 'donde', 'where', 'tengo', 'have']
  }
]);

// ANA — onboarding, logged-in patient uploading documents --------------

const ANA_FAQ = makeFAQ([
  {
    q_es: '¿Qué documentos debo subir?',
    q_en: 'What documents should I upload?',
    a_es: 'Dos archivos: (1) foto/PDF de tu credencial de seguro dental, ambos lados si es posible. (2) recibo del dentista en México con el desglose de procedimientos. JPG, PNG o PDF.',
    a_en: 'Two files: (1) photo/PDF of your dental insurance card, both sides if possible. (2) dentist receipt from Mexico with itemized procedures. JPG, PNG or PDF.',
    keywords: ['document', 'documento', 'subir', 'upload', 'archivo', 'file', 'papel']
  },
  {
    q_es: '¿Por qué piden mi credencial de seguro?',
    q_en: 'Why do you need my insurance card?',
    a_es: 'Para identificar tu plan y calcular tu cobertura exacta. Sin la credencial no podemos saber qué procedimientos cubre tu plan ni el porcentaje de reembolso esperado.',
    a_en: 'To identify your plan and calculate your exact coverage. Without the card we can\'t know which procedures your plan covers or the expected refund percentage.',
    keywords: ['credencial', 'card', 'insurance', 'seguro', 'porque', 'why', 'piden']
  },
  {
    q_es: '¿Mi recibo está en español, eso es problema?',
    q_en: 'My receipt is in Spanish, is that a problem?',
    a_es: 'No, lo traducimos nosotros. Súbelo tal como está y nuestro equipo se encarga de la traducción al inglés y de mapear los procedimientos a códigos CDT que tu aseguradora reconoce.',
    a_en: "No, we translate it. Upload it as-is and our team handles the English translation and maps the procedures to CDT codes your insurer recognizes.",
    keywords: ['espanol', 'spanish', 'idioma', 'language', 'traduc', 'translate']
  },
  {
    q_es: '¿Qué pasa después de subir mis documentos?',
    q_en: 'What happens after I upload my documents?',
    a_es: 'Nuestro sistema procesa el recibo (~2 minutos), te muestra el estimado de reembolso, eliges plan, firmas el agreement, pagas, y nosotros enviamos el claim a tu aseguradora dentro de 24 horas.',
    a_en: 'Our system processes the receipt (~2 minutes), shows you the refund estimate, you choose a plan, sign the agreement, pay, and we submit the claim to your insurer within 24 hours.',
    keywords: ['despues', 'after', 'siguiente', 'next', 'que pasa', 'what happens']
  },
  {
    q_es: '¿Puedo editar mi claim después de enviarlo?',
    q_en: 'Can I edit my claim after submitting?',
    a_es: 'Una vez enviado a la aseguradora no podemos modificarlo, pero si recibes alguna comunicación de la aseguradora pidiendo info adicional, te contactamos por email para ayudarte. Para correcciones antes del envío, escríbenos a ' + SUPPORT_EMAIL + '.',
    a_en: 'Once submitted to the insurer we can\'t modify it, but if the insurer requests additional info we email you to help. For pre-submission corrections, email ' + SUPPORT_EMAIL + '.',
    keywords: ['editar', 'edit', 'cambiar', 'change', 'modificar', 'modify', 'corregir']
  }
]);

// ELENA — pricing/plan questions, logged-in patient --------------------

const ELENA_FAQ = makeFAQ([
  {
    q_es: '¿Por qué me tocó plan Standard / Plus / Premium?',
    q_en: 'Why did I get Standard / Plus / Premium?',
    a_es: 'Asignamos plan según la complejidad de tu claim: Standard ($49) si es simple — pocos procedimientos, recibo claro. Plus ($79) si hay múltiples procedimientos o el recibo necesita más trabajo. Premium ($99) si hay códigos ambiguos, muchos procedimientos, o calidad de recibo baja.',
    a_en: 'We assign plan by claim complexity: Standard ($49) for simple claims — few procedures, clear receipt. Plus ($79) for multiple procedures or receipts needing more work. Premium ($99) for ambiguous codes, many procedures, or low receipt quality.',
    keywords: ['plan', 'standard', 'plus', 'premium', 'porque', 'why', 'asign']
  },
  {
    q_es: '¿Qué incluye mi plan?',
    q_en: 'What does my plan include?',
    a_es: 'Todos los planes incluyen: preparación del claim, traducción español→inglés, mapeo a códigos CDT, envío a tu aseguradora, seguimiento, y una resubmission si te niegan. Plus y Premium incluyen revisión de códigos más detallada.',
    a_en: 'All plans include: claim preparation, Spanish→English translation, CDT code mapping, submission to your insurer, follow-up, and one free resubmission if denied. Plus and Premium include more detailed code review.',
    keywords: ['incluye', 'include', 'que', 'what', 'features']
  },
  {
    q_es: '¿Es real lo del fee de $19 por resubmission?',
    q_en: 'Is the $19 resubmission fee real?',
    a_es: 'Sí. La primera resubmission es gratis. Si tu aseguradora te niega de nuevo y quieres reintentar, cada submission adicional es $19. Solo cobramos si tú decides reintentar — no es automático.',
    a_en: 'Yes. The first resubmission is free. If your insurer denies again and you want to retry, each additional submission is $19. We only charge if you choose to retry — never automatic.',
    keywords: ['resubmission', 'resub', '19', 'reintent', 'retry', 'denied', 'negaron']
  },
  {
    q_es: '¿Cómo funciona el money-back?',
    q_en: 'How does the money-back work?',
    a_es: 'Si tu claim era elegible bajo tu plan y no logramos reembolso después de la submission inicial + resubmission gratis, te devolvemos el 100% del fee. El procesamiento del refund toma 5-10 días hábiles a tu método de pago original.',
    a_en: 'If your claim was eligible under your plan and we couldn\'t get a refund after initial submission + free resubmission, we return 100% of your fee. Refund processing takes 5-10 business days to your original payment method.',
    keywords: ['money', 'back', 'garantia', 'refund', 'reembolso', 'devuel']
  }
]);

// MARCO — case status, logged-in patient with active claim -------------
// Marco answers ONLY status/process questions. ANY claim-specific question
// (about a specific denial, a specific procedure, a specific amount) is
// escalated to email so a human handles it.

const MARCO_FAQ = makeFAQ([
  {
    q_es: '¿Cuánto tarda mi aseguradora en responder?',
    q_en: 'How long does my insurer take to respond?',
    a_es: 'La mayoría de aseguradoras responden en 3-6 semanas desde la submission. Algunas se tardan hasta 8 semanas. Te avisamos por email cada vez que el status cambia.',
    a_en: 'Most insurers respond in 3-6 weeks from submission. Some take up to 8 weeks. We email you every time the status changes.',
    keywords: ['cuanto', 'tarda', 'how long', 'time', 'tiempo', 'demora', 'aseguradora', 'insurer']
  },
  {
    q_es: '¿Qué significan los status?',
    q_en: 'What do the statuses mean?',
    a_es: 'Submitted: enviado a tu aseguradora. In-review: la aseguradora lo está analizando. Approved: aprobado, te van a pagar. Paid: el reembolso ya salió. Denied: negado — te contactamos para opciones (resubmission gratis, money-back si aplica).',
    a_en: 'Submitted: sent to your insurer. In-review: insurer is analyzing it. Approved: approved, payment coming. Paid: refund issued. Denied: declined — we contact you with options (free resubmission, money-back if eligible).',
    keywords: ['status', 'estado', 'significa', 'mean', 'que es', 'submitted', 'review', 'approved', 'paid', 'denied']
  },
  {
    q_es: '¿Cómo me pagan el reembolso?',
    q_en: 'How do I get paid?',
    a_es: 'Tu aseguradora te paga a ti directo, no a Credimed. Algunas mandan cheque por correo, otras hacen depósito directo según el método que tengan registrado contigo. Llega 3-7 días hábiles después de aprobado.',
    a_en: 'Your insurer pays you directly, not Credimed. Some send a check by mail, others use direct deposit based on the method they have on file. Arrives 3-7 business days after approval.',
    keywords: ['pagan', 'pay', 'pago', 'payment', 'reembolso', 'refund', 'depos', 'cheque']
  },
  {
    q_es: '¿Qué hago si mi aseguradora me llama pidiendo info?',
    q_en: 'What if my insurer calls me asking for info?',
    a_es: 'Eso es normal — algunas aseguradoras verifican datos directamente contigo. Confirma la info que pidan basándote en tu claim. Si necesitas que nosotros respondamos algo técnico, escríbenos a ' + SUPPORT_EMAIL + ' con el detalle.',
    a_en: 'That\'s normal — some insurers verify data directly with you. Confirm the info they ask based on your claim. If you need us to answer something technical, email ' + SUPPORT_EMAIL + ' with details.',
    keywords: ['llama', 'call', 'call', 'aseguradora', 'insurer', 'pide', 'ask', 'info']
  },
  {
    q_es: 'Mi claim fue denegado, ¿qué hago?',
    q_en: 'My claim was denied, what do I do?',
    a_es: 'Lo siento que pasó eso. Tienes dos opciones: (1) resubmission gratis si encontramos un ángulo nuevo. (2) si tu claim era elegible bajo tu plan, aplica el 100% money-back. Por favor escríbenos a ' + SUPPORT_EMAIL + ' con tu claim ID y un asesor humano revisa tu caso específico.',
    a_en: "Sorry that happened. You have two options: (1) free resubmission if we find a new angle. (2) if your claim was eligible under your plan, the 100% money-back applies. Please email " + SUPPORT_EMAIL + " with your claim ID so a human advisor reviews your specific case.",
    keywords: ['denegado', 'denied', 'denegaron', 'rechaz', 'reject', 'no aprobaron']
  }
]);

// Public surface --------------------------------------------------------

window.CredimedFAQ = {
  sofia: SOFIA_FAQ,
  ana:   ANA_FAQ,
  elena: ELENA_FAQ,
  marco: MARCO_FAQ,
  SUPPORT_EMAIL: SUPPORT_EMAIL
};
