/**
 * The seed catalogue — `26-execution-plan.md` §D2, task 2.3.
 *
 * ## What this file is, and what it is not
 *
 * `26` §D2 calls this a workstream rather than a task, and says why: Phase 4 renders a form
 * from these rows and Phase 5 prices against them, so invented data means an invented demo.
 * It also says **two products fully specified beats eight sketched**, and that is what this
 * is. Two products carry every field `04` §Catalogue defines; the other five exist at name
 * level so the category tree and the product-selection screen are real, and so nobody
 * mistakes a stub for a specification.
 *
 * The Turkish is **written, not translated** (`07` §i18n). Where a Turkish trade term and a
 * literal translation differ, the trade term wins: an installer says *giyotin cam*, not
 * *gilotin camı*; *çıkıntı* rather than *projeksiyon*; *duvara dayalı* rather than
 * *duvara monte*. The English is the design screens' own copy where they have it.
 *
 * ## The part that matters most: what is not known
 *
 * Numeric bounds, which options are standard versus paid, and the option lists themselves
 * are **provisional**. Every one of them is written down as a question in
 * `25-progress.md` §Open questions, addressed to the pilot manufacturer of `26` §D3. A
 * plausible invented specification is worse than a blank, because nobody asks a blank a
 * question — so anything provisional is marked `@provisional` here and appears in that list.
 *
 * ## Identifiers
 *
 * Rows carry readable, deterministic ids (`prd_bioklimatik-pergola`) rather than `cuid()`.
 * `04` §Conventions asks for cuid on rows the application creates; these are fixtures, three
 * seed profiles must produce the same database, and `e2e/*.spec.ts` binds to them — the same
 * reasoning that already gave `E2E_IDS` fixed ids in Phase 0.
 */

export type Locale = 'tr' | 'en'

type Text = Record<Locale, string>

export type OptionSpec = {
  value: string
  label: Text
  sortOrder: number
  isActive?: boolean
}

export type AttributeSpec = {
  key: string
  inputType: 'NUMBER' | 'SELECT' | 'MULTISELECT' | 'BOOL' | 'TEXT'
  unit?: string
  min?: number
  max?: number
  step?: number
  isRequired: boolean
  /**
   * **Not a decorative flag.** It marks an attribute whose answer enters the price
   * calculation in `08` §Algorithm, and it is what Phase 5 reads to decide which
   * `PriceBookOptionPrice` rows a manufacturer must fill in.
   *
   * For `SELECT` / `MULTISELECT` / `BOOL` it means **step 3** — each selected option needs a
   * price from the manufacturer's price book. For `NUMBER` it means step 1 (the value feeds
   * the basis) or step 6 (it crosses a `PriceBookRule` threshold — `SIZE_SURCHARGE` and
   * `HEIGHT_SURCHARGE` both exist for exactly this). Either way, changing it invalidates a
   * cached estimate, which is the other thing Phase 4 uses it for.
   */
  affectsPrice: boolean
  sortOrder: number
  showIfAttributeKey?: string
  showIfValue?: string
  label: Text
  helpText?: Text
  options?: OptionSpec[]
}

export type ProductSpec = {
  slug: Text
  name: Text
  shortDescription?: Text
  description?: Text
  basisType: 'AREA_M2' | 'LENGTH_M' | 'UNIT'
  sortOrder: number
  /** `false` for the five name-level products: they exist, they are not specified. */
  fullySpecified: boolean
  attributes: AttributeSpec[]
}

export type CategorySpec = {
  slug: Text
  name: Text
  description?: Text
  sortOrder: number
  products: ProductSpec[]
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Shared option lists
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * RAL colours. These four are the ones that turn up on nearly every Turkish outdoor-systems
 * price list; `ozel_ral` is the escape hatch and is the one that carries a surcharge.
 *
 * @provisional — the *list* is confident, the assumption that only `ozel_ral` is chargeable
 * is not. Q11.
 */
const PROFILE_COLOURS: OptionSpec[] = [
  {
    value: 'ral_9016',
    label: { tr: 'RAL 9016 — Trafik beyazı', en: 'RAL 9016 — Traffic white' },
    sortOrder: 10,
  },
  {
    value: 'ral_7016',
    label: { tr: 'RAL 7016 — Antrasit gri', en: 'RAL 7016 — Anthracite grey' },
    sortOrder: 20,
  },
  {
    value: 'ral_9005',
    label: { tr: 'RAL 9005 — Mat siyah', en: 'RAL 9005 — Jet black' },
    sortOrder: 30,
  },
  { value: 'ozel_ral', label: { tr: 'Özel RAL kodu', en: 'Custom RAL code' }, sortOrder: 40 },
]

/* ─────────────────────────────────────────────────────────────────────────────
 * Product 1 · Bioklimatik pergola — fully specified
 *
 * Chosen because it is the product the designs specify most completely: it has its own
 * public detail screen (`product_detail_bioclimatic_pergola`), it is the first card in
 * `product_selection_step_1`, and `project_options_step_5` shows its option set. It is also
 * the product whose configuration is richest, so it is the one that actually exercises
 * Phase 4's form renderer.
 * ────────────────────────────────────────────────────────────────────────── */

const BIOCLIMATIC: ProductSpec = {
  slug: { tr: 'bioklimatik-pergola', en: 'bioclimatic-pergola' },
  name: { tr: 'Bioklimatik Pergola', en: 'Bioclimatic Pergola' },
  shortDescription: {
    tr: 'Motorlu hareketli alüminyum lamelleriyle güneşi, gölgeyi ve havalandırmayı derece derece ayarlayan pergola sistemi.',
    en: 'Automated louver system for precise sun and ventilation control.',
  },
  description: {
    tr: [
      'Bioklimatik pergola, çatısındaki alüminyum lamellerin dönmesiyle güneş açısını, gölgeyi ve hava',
      'akışını ayarlamanızı sağlar. Lameller kapatıldığında su sızdırmaz bir yüzey oluşturur; su,',
      'kolonların içindeki gizli tahliye kanallarından iner.',
      '',
      'Taşıyıcı yapı elektrostatik toz boyalı alüminyum profildir. Sistem duvara dayalı ya da dört',
      'ayak üzerinde serbest duran olarak kurulabilir; yan yüzeyler zip perde, sürme cam veya giyotin',
      'camla kapatılarak dört mevsim kullanılabilir hâle getirilebilir.',
    ].join('\n'),
    en: [
      'A bioclimatic pergola rotates its aluminium louvers to control sun angle, shade and airflow.',
      'Closed, the louvers form a watertight surface and drain through concealed channels inside the',
      'posts.',
      '',
      'The frame is powder-coated aluminium. The system can be wall-mounted or freestanding on four',
      'posts, and the sides can be closed with zip screens, sliding glass or guillotine glass to make',
      'it usable year-round.',
    ].join('\n'),
  },
  basisType: 'AREA_M2',
  sortOrder: 10,
  fullySpecified: true,
  attributes: [
    /*
     * Dimensions.
     *
     * `10` §Field specifics: millimetres, width / projection / height, outer-to-outer, and
     * the area is **derived** rather than typed. They are `ProductAttribute` rows because
     * `10` §Validation reads the bounds from `ProductAttribute.min`/`max`, and the bounds are
     * per product — a pergola bay and a guillotine-glass panel do not share a range.
     */
    {
      key: 'genislik_mm',
      inputType: 'NUMBER',
      unit: 'mm',
      min: 2000,
      max: 6000,
      step: 10,
      isRequired: true,
      affectsPrice: true,
      sortOrder: 10,
      label: { tr: 'Genişlik', en: 'Width' },
      helpText: {
        tr: 'Dıştan dışa ölçü. Tek modülün üst sınırı 6 metredir; daha geniş açıklıklar iki modülün birleştirilmesiyle çözülür ve bunu üretici planlar.',
        en: 'Outer-to-outer. A single module tops out at 6 m; wider spans are two coupled modules, which the manufacturer plans.',
      },
    },
    {
      key: 'cikinti_mm',
      inputType: 'NUMBER',
      unit: 'mm',
      min: 2000,
      max: 4500,
      step: 10,
      isRequired: true,
      affectsPrice: true,
      sortOrder: 20,
      label: { tr: 'Çıkıntı', en: 'Projection' },
      helpText: {
        tr: 'Duvardan ya da ön kolondan dışa doğru ölçü. Lamel boyu bu ölçüyü takip ettiği için üst sınırı taşıma kapasitesi belirler.',
        en: 'Distance out from the wall or front post. The louver span follows this dimension, so load capacity sets the limit.',
      },
    },
    {
      key: 'yukseklik_mm',
      inputType: 'NUMBER',
      unit: 'mm',
      min: 2200,
      max: 3500,
      step: 10,
      isRequired: true,
      affectsPrice: true,
      sortOrder: 30,
      label: { tr: 'Yükseklik', en: 'Height' },
      helpText: {
        tr: 'Bitmiş zeminden lamel altına. Yan kapama yapılacaksa bu ölçü cam veya perde yüksekliğini de belirler.',
        en: 'Finished floor to the underside of the louvers. If the sides are enclosed, this also sets the glass or screen height.',
      },
    },

    {
      key: 'montaj_tipi',
      inputType: 'SELECT',
      isRequired: true,
      affectsPrice: true,
      sortOrder: 40,
      label: { tr: 'Montaj tipi', en: 'Installation type' },
      helpText: {
        tr: 'Duvara dayalı sistemde arka kolon yoktur; yük taşıyıcı duvara aktarılır ve duvarın bunu kaldırması gerekir.',
        en: 'A wall-mounted system has no rear posts; the load transfers to the wall, which has to be able to take it.',
      },
      options: [
        {
          value: 'duvara_dayali',
          label: { tr: 'Duvara dayalı (2 kolon)', en: 'Wall-mounted (2 posts)' },
          sortOrder: 10,
        },
        {
          value: 'serbest_duran',
          label: { tr: 'Serbest duran (4 kolon)', en: 'Freestanding (4 posts)' },
          sortOrder: 20,
        },
      ],
    },

    {
      key: 'profil_rengi',
      inputType: 'SELECT',
      isRequired: true,
      affectsPrice: true,
      sortOrder: 50,
      label: { tr: 'Profil rengi', en: 'Frame colour' },
      helpText: {
        tr: 'Elektrostatik toz boya. Özel RAL kodları genellikle ek maliyet ve daha uzun üretim süresi getirir.',
        en: 'Powder coating. Custom RAL codes usually carry a surcharge and a longer lead time.',
      },
      options: PROFILE_COLOURS,
    },

    {
      key: 'motor_kontrol',
      inputType: 'SELECT',
      isRequired: true,
      affectsPrice: true,
      sortOrder: 60,
      label: { tr: 'Kumanda tipi', en: 'Control type' },
      helpText: {
        tr: 'Lamel hareketi her durumda motorludur; seçim, sistemi neyle kumanda edeceğinizdir.',
        en: 'The louvers are motorised in every case; this is what you operate them with.',
      },
      options: [
        {
          value: 'el_kumandasi',
          label: { tr: 'El kumandası', en: 'Handheld remote' },
          sortOrder: 10,
        },
        {
          value: 'duvar_anahtari',
          label: { tr: 'Duvar anahtarı', en: 'Wall switch' },
          sortOrder: 20,
        },
        {
          value: 'akilli_ev',
          label: { tr: 'Akıllı ev entegrasyonu', en: 'Smart-home integration' },
          sortOrder: 30,
        },
      ],
    },

    {
      key: 'sensor_paketi',
      inputType: 'MULTISELECT',
      isRequired: false,
      affectsPrice: true,
      sortOrder: 70,
      label: { tr: 'Sensörler', en: 'Sensors' },
      helpText: {
        tr: 'Yağmur sensörü lamelleri otomatik kapatır, rüzgâr sensörü açar. İkisi birlikte, evde kimse yokken sistemin kendini korumasını sağlar.',
        en: 'A rain sensor closes the louvers automatically; a wind sensor opens them. Together they let the system protect itself while nobody is home.',
      },
      options: [
        { value: 'yagmur', label: { tr: 'Yağmur sensörü', en: 'Rain sensor' }, sortOrder: 10 },
        { value: 'ruzgar', label: { tr: 'Rüzgâr sensörü', en: 'Wind sensor' }, sortOrder: 20 },
        { value: 'gunes', label: { tr: 'Güneş sensörü', en: 'Sun sensor' }, sortOrder: 30 },
      ],
    },

    {
      key: 'aydinlatma',
      inputType: 'SELECT',
      isRequired: true,
      affectsPrice: true,
      sortOrder: 80,
      label: { tr: 'Aydınlatma', en: 'Lighting' },
      options: [
        { value: 'yok', label: { tr: 'Yok', en: 'None' }, sortOrder: 10 },
        {
          value: 'led_serit',
          label: { tr: 'Profil içi LED şerit', en: 'LED strip in the profile' },
          sortOrder: 20,
        },
        {
          value: 'led_spot',
          label: { tr: 'Gömme LED spot', en: 'Recessed LED spots' },
          sortOrder: 30,
        },
      ],
    },

    {
      key: 'yan_kapama',
      inputType: 'SELECT',
      isRequired: true,
      affectsPrice: true,
      sortOrder: 90,
      label: { tr: 'Yan kapama', en: 'Side enclosure' },
      helpText: {
        tr: 'Yanları kapatmak pergolayı dört mevsim kullanılır hâle getirir. Kapama tipleri ayrı ürün olarak da satılır; burada pergolanın parçası olarak fiyatlanır.',
        en: 'Enclosing the sides makes the pergola usable year-round. These are sold as standalone products too; here they are priced as part of the pergola.',
      },
      options: [
        { value: 'yok', label: { tr: 'Açık bırak', en: 'Leave open' }, sortOrder: 10 },
        { value: 'zip_perde', label: { tr: 'Zip perde', en: 'Zip screen' }, sortOrder: 20 },
        { value: 'surme_cam', label: { tr: 'Sürme cam', en: 'Sliding glass' }, sortOrder: 30 },
        {
          value: 'giyotin_cam',
          label: { tr: 'Giyotin cam', en: 'Guillotine glass' },
          sortOrder: 40,
        },
      ],
    },

    /*
     * The single level of conditionality V1 has (`ADR-008`). The fabric question only makes
     * sense once the side enclosure is a zip screen, and it does not chain: `yan_kapama` is
     * itself unconditional.
     */
    {
      key: 'zip_kumas',
      inputType: 'SELECT',
      isRequired: false,
      affectsPrice: true,
      sortOrder: 100,
      showIfAttributeKey: 'yan_kapama',
      showIfValue: 'zip_perde',
      label: { tr: 'Zip perde kumaşı', en: 'Zip screen fabric' },
      helpText: {
        tr: 'Şeffaf PVC manzarayı korur ama nefes almaz; mesh kumaş güneşi keser ve hava geçirir; akrilik ikisinin arasındadır.',
        en: 'Clear PVC keeps the view but does not breathe; mesh cuts the sun and lets air through; acrylic sits between the two.',
      },
      options: [
        { value: 'seffaf_pvc', label: { tr: 'Şeffaf PVC', en: 'Clear PVC' }, sortOrder: 10 },
        { value: 'mesh', label: { tr: 'Mesh (gölgelik) kumaş', en: 'Mesh fabric' }, sortOrder: 20 },
        { value: 'akrilik', label: { tr: 'Akrilik kumaş', en: 'Acrylic fabric' }, sortOrder: 30 },
      ],
    },

    {
      key: 'su_tahliye',
      inputType: 'SELECT',
      isRequired: true,
      affectsPrice: true,
      sortOrder: 110,
      label: { tr: 'Su tahliyesi', en: 'Water drainage' },
      helpText: {
        tr: 'Gizli tahliyede su kolonun içinden iner ve görünürde oluk yoktur; dış oluk daha ucuzdur ama görünür.',
        en: 'Concealed drainage runs the water down inside a post with no visible gutter; an external gutter is cheaper but visible.',
      },
      options: [
        {
          value: 'kolon_ici_gizli',
          label: { tr: 'Kolon içinden gizli tahliye', en: 'Concealed, through the post' },
          sortOrder: 10,
        },
        {
          value: 'dis_oluk',
          label: { tr: 'Dış yağmur oluğu', en: 'External gutter' },
          sortOrder: 20,
        },
      ],
    },
  ],
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Product 2 · Giyotin cam — fully specified
 *
 * Why this one, and not one of the other six.
 *
 * `project_options_step_5` shows *Zip Screen Blinds* and *Sliding Glass System* as options
 * **on** the pergola, so specifying either as a standalone product first would specify the
 * same thing twice from two directions. Guillotine glass appears in `product_selection_step_1`
 * as a system in its own right, it is one of the highest-volume outdoor-glazing products in
 * Turkey — balcony and café enclosures — and its attribute set is genuinely a different
 * shape from the pergola's, so Phase 4's renderer and Phase 5's arithmetic get two different
 * problems rather than the same one twice.
 *
 * Winter garden was the alternative and was rejected: it is a roof *and* walls *and* a
 * thermal break, which is three specifications, and specifying it from outside the trade
 * would be exactly the invention this file is trying to avoid.
 * ────────────────────────────────────────────────────────────────────────── */

const GUILLOTINE_GLASS: ProductSpec = {
  slug: { tr: 'giyotin-cam', en: 'guillotine-glass' },
  name: { tr: 'Giyotin Cam', en: 'Guillotine Glass' },
  shortDescription: {
    tr: 'Dikey olarak yukarı çekilerek açılan cam panel sistemi; kapalıyken rüzgâr ve yağmuru keser, açıkken korkuluk görevi görür.',
    en: 'Motorized vertically retracting glass panels acting as balustrade and window.',
  },
  description: {
    tr: [
      'Giyotin cam, panelleri yanlara değil yukarı doğru hareket ettirir; bu yüzden açıkken yanlarda',
      'yığılan cam olmaz ve açıklığın tamamı kullanılabilir. Balkon, teras ve kafe kapamalarında en',
      'çok tercih edilen sistemlerden biridir.',
      '',
      'Paneller alüminyum kasa içinde karşı ağırlıkla dengelenir. Kaç panele bölüneceğini açıklık',
      'genişliği belirler ve bunu üretici hesaplar — sizin vermeniz gereken ölçü açıklığın kendisidir.',
    ].join('\n'),
    en: [
      'Guillotine glass moves its panels vertically rather than sideways, so nothing stacks at the',
      'edges and the full opening stays usable. It is one of the most common enclosure systems for',
      'balconies, terraces and cafés in Turkey.',
      '',
      'The panels are counterbalanced inside an aluminium frame. How many panels an opening needs is',
      'a consequence of its width and the manufacturer calculates it — what you supply is the',
      'opening.',
    ].join('\n'),
  },
  basisType: 'AREA_M2',
  sortOrder: 10,
  fullySpecified: true,
  attributes: [
    {
      key: 'genislik_mm',
      inputType: 'NUMBER',
      unit: 'mm',
      min: 1000,
      max: 6000,
      step: 10,
      isRequired: true,
      affectsPrice: true,
      sortOrder: 10,
      label: { tr: 'Açıklık genişliği', en: 'Opening width' },
      helpText: {
        tr: 'Kasa dahil, dıştan dışa. Kaç panele bölüneceğini üretici hesaplar.',
        en: 'Outer-to-outer including the frame. The manufacturer works out the panel count.',
      },
    },
    {
      key: 'yukseklik_mm',
      inputType: 'NUMBER',
      unit: 'mm',
      min: 1000,
      max: 3000,
      step: 10,
      isRequired: true,
      affectsPrice: true,
      sortOrder: 20,
      label: { tr: 'Açıklık yüksekliği', en: 'Opening height' },
    },

    {
      key: 'cam_tipi',
      inputType: 'SELECT',
      isRequired: true,
      affectsPrice: true,
      sortOrder: 30,
      label: { tr: 'Cam tipi', en: 'Glazing' },
      helpText: {
        tr: 'Isıcam ısı yalıtımı sağlar ama panelleri ağırlaştırır; tek cam daha hafif ve ucuzdur, kışın ısı tutmaz.',
        en: 'Double glazing insulates but makes the panels heavier; single glazing is lighter and cheaper and does not hold heat.',
      },
      options: [
        {
          value: 'temperli_tek_cam',
          label: { tr: 'Temperli tek cam (8 mm)', en: 'Toughened single glazing (8 mm)' },
          sortOrder: 10,
        },
        {
          value: 'isicam',
          label: { tr: 'Isıcam (çift cam)', en: 'Double glazing' },
          sortOrder: 20,
        },
        { value: 'lamine', label: { tr: 'Lamine cam', en: 'Laminated glass' }, sortOrder: 30 },
      ],
    },

    {
      key: 'profil_rengi',
      inputType: 'SELECT',
      isRequired: true,
      affectsPrice: true,
      sortOrder: 40,
      label: { tr: 'Profil rengi', en: 'Frame colour' },
      options: [
        ...PROFILE_COLOURS,
        {
          value: 'ahsap_desen',
          label: { tr: 'Ahşap desenli kaplama', en: 'Wood-effect finish' },
          sortOrder: 50,
        },
      ],
    },

    {
      key: 'hareket_tipi',
      inputType: 'SELECT',
      isRequired: true,
      affectsPrice: true,
      sortOrder: 50,
      label: { tr: 'Hareket tipi', en: 'Operation' },
      helpText: {
        tr: 'Manuel sistemde paneller elle kaldırılır ve karşı ağırlıkla dengede durur; motorlu sistemde kumandayla hareket eder.',
        en: 'Manual panels are lifted by hand and held by counterweights; motorised panels move on a remote.',
      },
      options: [
        { value: 'manuel', label: { tr: 'Manuel', en: 'Manual' }, sortOrder: 10 },
        { value: 'motorlu', label: { tr: 'Motorlu', en: 'Motorised' }, sortOrder: 20 },
      ],
    },

    /* The one-level dependency, and the example `10` §What V1 builds itself gives. */
    {
      key: 'motor_markasi',
      inputType: 'SELECT',
      isRequired: false,
      affectsPrice: true,
      sortOrder: 60,
      showIfAttributeKey: 'hareket_tipi',
      showIfValue: 'motorlu',
      label: { tr: 'Motor markası', en: 'Motor brand' },
      helpText: {
        tr: 'Tercihiniz yoksa üretici kendi çalıştığı markayı kullanır; bu genellikle en uygun fiyatlı seçenektir.',
        en: 'With no preference the manufacturer uses the brand they normally fit, which is usually the cheapest option.',
      },
      options: [
        { value: 'farketmez', label: { tr: 'Farketmez', en: 'No preference' }, sortOrder: 10 },
        { value: 'somfy', label: { tr: 'Somfy', en: 'Somfy' }, sortOrder: 20 },
        { value: 'nice', label: { tr: 'Nice', en: 'Nice' }, sortOrder: 30 },
      ],
    },

    {
      key: 'sineklik',
      inputType: 'SELECT',
      isRequired: false,
      affectsPrice: true,
      sortOrder: 70,
      label: { tr: 'Sineklik', en: 'Insect screen' },
      options: [
        { value: 'yok', label: { tr: 'Yok', en: 'None' }, sortOrder: 10 },
        { value: 'plise', label: { tr: 'Plise sineklik', en: 'Pleated screen' }, sortOrder: 20 },
        { value: 'stor', label: { tr: 'Stor sineklik', en: 'Roller screen' }, sortOrder: 30 },
      ],
    },

    {
      key: 'kilit_sistemi',
      inputType: 'SELECT',
      isRequired: true,
      affectsPrice: true,
      sortOrder: 80,
      label: { tr: 'Kilit sistemi', en: 'Locking' },
      options: [
        { value: 'standart', label: { tr: 'Standart kilit', en: 'Standard lock' }, sortOrder: 10 },
        {
          value: 'guvenlik',
          label: { tr: 'Güvenlik kilidi', en: 'Security lock' },
          sortOrder: 20,
        },
      ],
    },
  ],
}

/* ─────────────────────────────────────────────────────────────────────────────
 * The other five — name level only, deliberately
 *
 * `26` §D2: *"Two products fully specified beats eight sketched."* A half-specified product
 * looks finished in a list and turns into a surprise in Phase 4; these five carry no
 * attributes at all, so nothing about them can be mistaken for a specification. They exist
 * because `product_selection_step_1` shows seven cards and a category tree with two products
 * in it is not the tree the screen renders.
 *
 * `isActive` stays true: they are real products the platform intends to sell, and hiding
 * them would make the seed disagree with the design for no gain. What they lack is the
 * attribute set, and `fullySpecified: false` is what the seed reports.
 * ────────────────────────────────────────────────────────────────────────── */

const stub = (
  slugTr: string,
  slugEn: string,
  nameTr: string,
  nameEn: string,
  shortTr: string,
  shortEn: string,
  sortOrder: number,
): ProductSpec => ({
  slug: { tr: slugTr, en: slugEn },
  name: { tr: nameTr, en: nameEn },
  shortDescription: { tr: shortTr, en: shortEn },
  basisType: 'AREA_M2',
  sortOrder,
  fullySpecified: false,
  attributes: [],
})

export const CATALOGUE: CategorySpec[] = [
  {
    slug: { tr: 'pergola-sistemleri', en: 'pergola-systems' },
    name: { tr: 'Pergola Sistemleri', en: 'Pergola Systems' },
    description: {
      tr: 'Terasın üstünü kapatan, gölgeyi ve havalandırmayı yöneten taşıyıcı sistemler.',
      en: 'Structures that cover a terrace and manage shade and airflow.',
    },
    sortOrder: 10,
    products: [
      BIOCLIMATIC,
      stub(
        'klasik-pergola',
        'classic-pergola',
        'Klasik Pergola',
        'Classic Pergola',
        'Sabit çatılı, hareketsiz gölgelendirme sistemi.',
        'Fixed structural framework for integrated shading solutions.',
        20,
      ),
    ],
  },
  {
    slug: { tr: 'cam-sistemleri', en: 'glass-systems' },
    name: { tr: 'Cam Sistemleri', en: 'Glass Systems' },
    description: {
      tr: 'Balkon, teras ve kafe kapamalarında kullanılan cam kapama sistemleri.',
      en: 'Glazed enclosure systems for balconies, terraces and cafés.',
    },
    sortOrder: 20,
    products: [
      GUILLOTINE_GLASS,
      stub(
        'surme-cam-sistemi',
        'sliding-glass-system',
        'Sürme Cam Sistemi',
        'Sliding Glass',
        'Yanlara kayan çerçevesiz cam paneller.',
        'Minimalist sliding panel systems for seamless indoor-outdoor transition.',
        20,
      ),
      stub(
        'kis-bahcesi',
        'winter-garden',
        'Kış Bahçesi',
        'Winter Garden',
        'Isı yalıtımlı, dört mevsim kullanılan tam kapalı cam yapı.',
        'Fully enclosed, thermally broken glass structures for year-round use.',
        30,
      ),
    ],
  },
  {
    slug: { tr: 'golgelendirme', en: 'shading' },
    name: { tr: 'Gölgelendirme', en: 'Shading' },
    description: {
      tr: 'Kumaş esaslı gölgelendirme ve güneş kontrol sistemleri.',
      en: 'Fabric-based shading and solar-control systems.',
    },
    sortOrder: 30,
    products: [
      stub(
        'kasetli-tente',
        'retractable-awning',
        'Kasetli Tente',
        'Retractable Awning',
        'Kapalı kaset içine toplanan mafsallı kol tente.',
        'Premium cantilevered fabric shading systems with concealed cassettes.',
        10,
      ),
      stub(
        'zip-perde',
        'zip-screen',
        'Zip Perde',
        'Zip Screen',
        'Rüzgâra dayanıklı, yanlardan kanala oturan dikey dış mekân perdesi.',
        'Vertical wind-resistant exterior roller blinds for solar control and privacy.',
        20,
      ),
    ],
  },
]

/** For the seed summary and for the tests that assert the D2 shape. */
export const FULLY_SPECIFIED_SLUGS = ['bioklimatik-pergola', 'giyotin-cam'] as const
