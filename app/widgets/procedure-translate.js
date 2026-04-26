/**
 * Procedure name translator — Mexican Spanish dental terms → English.
 *
 * The OCR reads the receipt verbatim ('Endodoncia pieza 14',
 * 'Extracción de muela del juicio', 'Anestesia local'), which is
 * intimidating for a US patient and blocks some insurers' auto-parse
 * of the claim form. This dictionary covers ~95% of cases without
 * needing a translation API. Unknown terms pass through unchanged.
 *
 * Used on every page that surfaces procedures: dashboard, claim,
 * claims, admin. Loaded once via <script src="widgets/procedure-translate.js">,
 * exposes window.translateProcedure(string) and window.translateProcedures(arr).
 *
 * Order matters: longer / more specific phrases first so they win
 * over shorter substrings (e.g. 'muela del juicio' is matched before
 * 'muela' alone).
 */
(function () {
  'use strict';

  var MAP = [
    // Wisdom teeth / specific teeth (must come before generic 'muela')
    [/\bmuelas?\s+del\s+juicio\b/gi,                    'wisdom tooth'],
    [/\bextracci[oó]n\s+de\s+muelas?\s+del\s+juicio\b/gi,'wisdom tooth extraction'],
    [/\bextracci[oó]n\s+simple\b/gi,                    'simple extraction'],
    [/\bextracci[oó]n\s+quir[uú]rgica\b/gi,             'surgical extraction'],
    [/\bextracci[oó]n\s+dental\b/gi,                    'dental extraction'],
    [/\bextracciones?\b/gi,                             'extraction'],

    // Anesthesia
    [/\banestesia\s+local\b/gi,                         'local anesthesia'],
    [/\banestesia\s+general\b/gi,                       'general anesthesia'],
    [/\banestesia\s+troncular\b/gi,                     'block anesthesia'],
    [/\banestesia\b/gi,                                 'anesthesia'],

    // Medication
    [/\bmedicaci[oó]n\s+postoperatoria\b/gi,            'post-operative medication'],
    [/\bmedicaci[oó]n\s+preoperatoria\b/gi,             'pre-operative medication'],
    [/\bmedicaci[oó]n\b/gi,                             'medication'],
    [/\banalg[eé]sicos?\b/gi,                           'pain medication'],
    [/\bantibi[oó]ticos?\b/gi,                          'antibiotics'],

    // Endodontics
    [/\bendodoncias?\b/gi,                              'root canal'],
    [/\btratamiento\s+de\s+conducto\b/gi,               'root canal treatment'],
    [/\bpulpotom[ií]a\b/gi,                             'pulpotomy'],
    [/\bpulpectom[ií]a\b/gi,                            'pulpectomy'],

    // Crowns & prosthetics
    [/\bcorona\s+de\s+zirconia\b/gi,                    'zirconia crown'],
    [/\bcorona\s+de\s+porcelana\b/gi,                   'porcelain crown'],
    [/\bcorona\s+metal[- ]?porcelana\b/gi,              'porcelain-fused-to-metal crown'],
    [/\bcorona\s+definitiva\b/gi,                       'permanent crown'],
    [/\bcorona\s+temporal\b/gi,                         'temporary crown'],
    [/\bcoronas?\b/gi,                                  'crown'],
    [/\bcarillas?\b/gi,                                 'veneer'],
    [/\bpuente\s+dental\b/gi,                           'dental bridge'],
    [/\bpuentes?\b/gi,                                  'bridge'],
    [/\bpr[oó]tesis\s+dental\b/gi,                      'dental prosthesis'],
    [/\bpr[oó]tesis\b/gi,                               'prosthesis'],
    [/\bdentadura\s+postiza\b/gi,                       'dentures'],
    [/\bdentadura\b/gi,                                 'denture'],

    // Fillings / restorations
    [/\breconstrucci[oó]n\s+dental\b/gi,                'dental filling'],
    [/\breconstrucci[oó]n\b/gi,                         'filling'],
    [/\bresinas?\s+compuestas?\b/gi,                    'composite filling'],
    [/\bresinas?\b/gi,                                  'composite filling'],
    [/\bamalgamas?\b/gi,                                'amalgam filling'],
    [/\bincrustaci[oó]n\b/gi,                           'inlay/onlay'],
    [/\bobturaci[oó]n\b/gi,                             'filling'],
    [/\bempastes?\b/gi,                                 'filling'],

    // Hygiene / preventive
    [/\blimpieza\s+profunda\b/gi,                       'deep cleaning'],
    [/\blimpieza\s+dental\b/gi,                         'dental cleaning'],
    [/\bprofilaxis\b/gi,                                'cleaning (prophylaxis)'],
    [/\braspado\s+y\s+alisado\s+radicular\b/gi,         'scaling and root planing'],
    [/\braspado\b/gi,                                   'scaling'],
    [/\bblanqueamiento\b/gi,                            'teeth whitening'],
    [/\bsellador(?:es)?\b/gi,                           'sealants'],
    [/\bfluorizaci[oó]n\b/gi,                           'fluoride treatment'],

    // Surgical / periodontal
    [/\bimplantes?\s+dentales?\b/gi,                    'dental implant'],
    [/\bimplantes?\b/gi,                                'implant'],
    [/\bgingivectom[ií]a\b/gi,                          'gingivectomy'],
    [/\balargamiento\s+de\s+corona\b/gi,                'crown lengthening'],
    [/\bcuretaje\b/gi,                                  'curettage'],
    [/\bcirug[ií]a\s+oral\b/gi,                         'oral surgery'],
    [/\bcirug[ií]a\s+periodontal\b/gi,                  'periodontal surgery'],

    // Orthodontic
    [/\bortodoncias?\b/gi,                              'orthodontics'],
    [/\bbrackets?\b/gi,                                 'braces'],
    [/\baparato\s+dental\b/gi,                          'dental appliance'],
    [/\bf[eé]rula\s+dental\b/gi,                        'dental splint / night guard'],
    [/\bf[eé]rula\b/gi,                                 'splint'],
    [/\bretenedor(?:es)?\b/gi,                          'retainer'],

    // Diagnostics
    [/\bradiograf[ií]as?\s+panor[aá]micas?\b/gi,        'panoramic x-ray'],
    [/\bradiograf[ií]as?\s+periapicales?\b/gi,          'periapical x-ray'],
    [/\bradiograf[ií]as?\b/gi,                          'x-ray'],
    [/\btomograf[ií]a\b/gi,                             'CT scan'],
    [/\bconsulta\s+dental\b/gi,                         'dental consultation'],
    [/\bconsultas?\b/gi,                                'consultation'],
    [/\bdiagn[oó]stico\b/gi,                            'diagnosis'],
    [/\brevisi[oó]n\b/gi,                               'check-up'],

    // Tooth qualifiers (positional / type)
    [/\bpieza\s+(\d+)\b/gi,                             'tooth #$1'],
    [/\bdiente\b/gi,                                    'tooth'],
    [/\bmolares?\b/gi,                                  'molar'],
    [/\bpremolares?\b/gi,                               'premolar'],
    [/\bincisivos?\b/gi,                                'incisor'],
    [/\bcaninos?\b/gi,                                  'canine'],
    [/\bmaxilar\s+superior\b/gi,                        'upper jaw'],
    [/\bmaxilar\s+inferior\b/gi,                        'lower jaw'],
    [/\bmand[ií]bula\b/gi,                              'mandible']
  ];

  function translateProcedure(raw) {
    if (!raw || typeof raw !== 'string') return raw;
    var s = raw;
    for (var i = 0; i < MAP.length; i++) s = s.replace(MAP[i][0], MAP[i][1]);
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function translateProcedures(input) {
    if (!input) return input;
    if (Array.isArray(input)) return input.map(translateProcedure);
    return translateProcedure(input);
  }

  window.translateProcedure  = translateProcedure;
  window.translateProcedures = translateProcedures;
})();
