/**
 * Etiquetas legibles para valores de dimensiones de Search Console.
 * GSC devuelve países en ISO 3166-1 alfa-3 en minúsculas ("col", "usa") y
 * dispositivos/apariciones como constantes en mayúsculas.
 */

const ALPHA3_TO_ALPHA2_RAW =
  'AFG:AF,ALA:AX,ALB:AL,DZA:DZ,ASM:AS,AND:AD,AGO:AO,AIA:AI,ATA:AQ,ATG:AG,ARG:AR,ARM:AM,ABW:AW,AUS:AU,AUT:AT,' +
  'AZE:AZ,BHS:BS,BHR:BH,BGD:BD,BRB:BB,BLR:BY,BEL:BE,BLZ:BZ,BEN:BJ,BMU:BM,BTN:BT,BOL:BO,BES:BQ,BIH:BA,BWA:BW,' +
  'BVT:BV,BRA:BR,IOT:IO,BRN:BN,BGR:BG,BFA:BF,BDI:BI,CPV:CV,KHM:KH,CMR:CM,CAN:CA,CYM:KY,CAF:CF,TCD:TD,CHL:CL,' +
  'CHN:CN,CXR:CX,CCK:CC,COL:CO,COM:KM,COG:CG,COD:CD,COK:CK,CRI:CR,CIV:CI,HRV:HR,CUB:CU,CUW:CW,CYP:CY,CZE:CZ,' +
  'DNK:DK,DJI:DJ,DMA:DM,DOM:DO,ECU:EC,EGY:EG,SLV:SV,GNQ:GQ,ERI:ER,EST:EE,SWZ:SZ,ETH:ET,FLK:FK,FRO:FO,FJI:FJ,' +
  'FIN:FI,FRA:FR,GUF:GF,PYF:PF,ATF:TF,GAB:GA,GMB:GM,GEO:GE,DEU:DE,GHA:GH,GIB:GI,GRC:GR,GRL:GL,GRD:GD,GLP:GP,' +
  'GUM:GU,GTM:GT,GGY:GG,GIN:GN,GNB:GW,GUY:GY,HTI:HT,HMD:HM,VAT:VA,HND:HN,HKG:HK,HUN:HU,ISL:IS,IND:IN,IDN:ID,' +
  'IRN:IR,IRQ:IQ,IRL:IE,IMN:IM,ISR:IL,ITA:IT,JAM:JM,JPN:JP,JEY:JE,JOR:JO,KAZ:KZ,KEN:KE,KIR:KI,PRK:KP,KOR:KR,' +
  'KWT:KW,KGZ:KG,LAO:LA,LVA:LV,LBN:LB,LSO:LS,LBR:LR,LBY:LY,LIE:LI,LTU:LT,LUX:LU,MAC:MO,MDG:MG,MWI:MW,MYS:MY,' +
  'MDV:MV,MLI:ML,MLT:MT,MHL:MH,MTQ:MQ,MRT:MR,MUS:MU,MYT:YT,MEX:MX,FSM:FM,MDA:MD,MCO:MC,MNG:MN,MNE:ME,MSR:MS,' +
  'MAR:MA,MOZ:MZ,MMR:MM,NAM:NA,NRU:NR,NPL:NP,NLD:NL,NCL:NC,NZL:NZ,NIC:NI,NER:NE,NGA:NG,NIU:NU,NFK:NF,MKD:MK,' +
  'MNP:MP,NOR:NO,OMN:OM,PAK:PK,PLW:PW,PSE:PS,PAN:PA,PNG:PG,PRY:PY,PER:PE,PHL:PH,PCN:PN,POL:PL,PRT:PT,PRI:PR,' +
  'QAT:QA,REU:RE,ROU:RO,RUS:RU,RWA:RW,BLM:BL,SHN:SH,KNA:KN,LCA:LC,MAF:MF,SPM:PM,VCT:VC,WSM:WS,SMR:SM,STP:ST,' +
  'SAU:SA,SEN:SN,SRB:RS,SYC:SC,SLE:SL,SGP:SG,SXM:SX,SVK:SK,SVN:SI,SLB:SB,SOM:SO,ZAF:ZA,SGS:GS,SSD:SS,ESP:ES,' +
  'LKA:LK,SDN:SD,SUR:SR,SJM:SJ,SWE:SE,CHE:CH,SYR:SY,TWN:TW,TJK:TJ,TZA:TZ,THA:TH,TLS:TL,TGO:TG,TKL:TK,TON:TO,' +
  'TTO:TT,TUN:TN,TUR:TR,TKM:TM,TCA:TC,TUV:TV,UGA:UG,UKR:UA,ARE:AE,GBR:GB,USA:US,UMI:UM,URY:UY,UZB:UZ,VUT:VU,' +
  'VEN:VE,VNM:VN,VGB:VG,VIR:VI,WLF:WF,ESH:EH,YEM:YE,ZMB:ZM,ZWE:ZW,XKK:XK';

const ALPHA3_TO_ALPHA2: ReadonlyMap<string, string> = new Map(
  ALPHA3_TO_ALPHA2_RAW.split(',').map((pair) => pair.split(':') as [string, string]),
);

const displayNamesCache = new Map<string, Intl.DisplayNames | null>();

function regionNames(lang: 'en' | 'es'): Intl.DisplayNames | null {
  if (!displayNamesCache.has(lang)) {
    try {
      displayNamesCache.set(lang, new Intl.DisplayNames([lang], { type: 'region' }));
    } catch {
      displayNamesCache.set(lang, null);
    }
  }
  return displayNamesCache.get(lang) ?? null;
}

export function countryAlpha2(code: string): string | null {
  return ALPHA3_TO_ALPHA2.get(code.trim().toUpperCase()) ?? null;
}

export function countryName(code: string, lang: 'en' | 'es' = 'en'): string {
  const normalized = code.trim().toUpperCase();
  if (normalized === 'ZZZ') return lang === 'es' ? 'Región desconocida' : 'Unknown region';
  const alpha2 = countryAlpha2(normalized);
  if (!alpha2) return normalized;
  try {
    return regionNames(lang)?.of(alpha2) ?? normalized;
  } catch {
    return normalized;
  }
}

export const DEVICE_LABELS: Record<string, { en: string; es: string }> = {
  DESKTOP: { en: 'Desktop', es: 'Escritorio' },
  MOBILE: { en: 'Mobile', es: 'Móvil' },
  TABLET: { en: 'Tablet', es: 'Tablet' },
};

export function deviceLabel(device: string, lang: 'en' | 'es' = 'en'): string {
  return DEVICE_LABELS[device.toUpperCase()]?.[lang] ?? device;
}

const SEARCH_APPEARANCE_LABELS: Record<string, { en: string; es: string }> = {
  AMP_BLUE_LINK: { en: 'AMP non-rich results', es: 'Resultados AMP sin formato enriquecido' },
  AMP_TOP_STORIES: { en: 'AMP top stories', es: 'Noticias destacadas AMP' },
  BREADCRUMB: { en: 'Breadcrumbs', es: 'Rutas de exploración' },
  EVENT: { en: 'Event listings', es: 'Eventos' },
  FAQ: { en: 'FAQ rich results', es: 'Resultados enriquecidos de preguntas frecuentes' },
  HOWTO: { en: 'How-to rich results', es: 'Resultados de instrucciones' },
  IMAGE_PACK: { en: 'Image packs', es: 'Bloques de imágenes' },
  JOB_LISTING: { en: 'Job listings', es: 'Ofertas de empleo' },
  JOB_DETAILS: { en: 'Job details', es: 'Detalles de empleo' },
  MERCHANT_LISTINGS: { en: 'Merchant listings', es: 'Fichas de comerciantes' },
  ORGANIC_SHOPPING: { en: 'Shopping', es: 'Shopping' },
  PRODUCT_SNIPPETS: { en: 'Product snippets', es: 'Fragmentos de productos' },
  RECIPE_FEATURE: { en: 'Recipe features', es: 'Recetas destacadas' },
  RECIPE_RICH_SNIPPET: { en: 'Recipe rich results', es: 'Resultados enriquecidos de recetas' },
  REVIEW_SNIPPET: { en: 'Review snippets', es: 'Fragmentos de reseñas' },
  SITELINKS: { en: 'Sitelinks', es: 'Enlaces de sitio' },
  TRANSLATED_RESULT: { en: 'Translated results', es: 'Resultados traducidos' },
  VIDEO: { en: 'Videos', es: 'Vídeos' },
  WEBLITE: { en: 'Web Light results', es: 'Resultados Web Light' },
};

export function searchAppearanceLabel(value: string, lang: 'en' | 'es' = 'en'): string {
  const known = SEARCH_APPEARANCE_LABELS[value.toUpperCase()];
  if (known) return known[lang];
  const human = value
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .join(' ');
  return human.charAt(0).toUpperCase() + human.slice(1);
}
