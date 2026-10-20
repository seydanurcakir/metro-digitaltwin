import type { SourceRef } from '../types';

export const SOURCES: SourceRef[] = [
  {
    id: 'sl-fakta-2022',
    title: 'Region Stockholm – Fakta om SL och länet 2022 (Påstigande per station – Tunnelbana)',
    url: 'https://regionstockholm.se/4a2748/contentassets/d6c4da12e11843c0ab8249c297dfd8fe/fakta-om-sl-och-lanet-2022.pdf',
    note: 'Kış iş günü ortalama günlük biniş. Metroda sayım elle yapılır. 2022 metro toplamı 912 000.',
  },
  {
    id: 'wiki-red-line',
    title: 'Wikipedia – Red line (Stockholm Metro)',
    url: 'https://en.wikipedia.org/wiki/Red_line_(Stockholm_Metro)',
    note: 'Hatlar, sefer aralıkları (T14 zirvede 5 dk), ortak gövdede saatte 24 tren, 2019 Kırmızı Hat istasyon binişleri.',
  },
  {
    id: 'sl-fakta-2019',
    title: 'SL och regionen 2019',
    url: 'https://miljobarometern.stockholm.se/content/Trafikrelaterat/sl_och_regionen_2019.pdf',
    note: '2019 metro toplamı 1 266 000 biniş. 2019 değerlerini 2022 düzeyine ölçeklemek için kullanılır.',
  },
  {
    id: 'wiki-c20',
    title: 'Wikipedia – SL C20',
    url: 'https://en.wikipedia.org/wiki/SL_C20',
    note: '3 vagonlu ünite, 46,5 m, 126 oturma + 288 ayakta = 414 kişi. Trenler 2 veya 3 üniteden oluşur.',
  },
  {
    id: 'wiki-solna',
    title: 'Wikipedia – Solna station',
    url: 'https://en.wikipedia.org/wiki/Solna_station',
    note: 'Pendeltåg J40, J41, 42X; ada peron; Tvärbanan L30 bağlantısı; 2019’da iş günü 20 900 biniş.',
  },
  {
    id: 'wiki-citybanan',
    title: 'Wikipedia – Stockholm City Line (Citybanan)',
    url: 'https://en.wikipedia.org/wiki/Stockholm_City_Line',
    note: '7,4 km; yön başına saatte 24 tren, bunun 16’sı pendeltåg; ATC-2; Stockholm City istasyonu T-Centralen’in altında.',
  },
  {
    id: 'wiki-pendeltag',
    title: 'Wikipedia – Stockholm commuter rail',
    url: 'https://en.wikipedia.org/wiki/Stockholm_commuter_rail',
    note: 'Hat 41 gündüz 15 dk, hat 40 genelde 30 dk; zirvede ek seferlerle ortalama 7,5 dk; merkez bölümde 3–4 dk; yalnızca X60 kullanılır.',
  },
  {
    id: 'wiki-x60',
    title: 'Wikipedia – SL X60',
    url: 'https://en.wikipedia.org/wiki/SL_X60',
    note: '6 vagonlu ünite 107,1 m; 374 oturma, 530 ayakta (sayfa bu değerlerin ünite mi vagon mu başına olduğunu çelişkili veriyor; ünite başı kabul edildi); iki ünite 214 m.',
  },
  {
    id: 'solna-stad',
    title: 'Solna stad – How to get to Solna via public transport',
    url: 'https://www.solna.se/om-solna-stad/kontakt-och-kommunikation/sa-tar-du-dig-till-solna/how-to-get-to-solna-via-public-transport',
    note: 'Stockholm City’den (T-Centralen’in yanında) Solna station’a pendeltåg ile 7 dakika; hatlar 40, 41, 42.',
  },
  {
    id: 'assumption',
    title: 'Model varsayımı',
    note: 'Gerçek değer bulunamadı; makul bir başlangıç değeri. İşletmeci verisiyle değiştirilmeli.',
  },
  {
    id: 'optimizer',
    title: 'Metro İkizi optimizasyonu (scripts/optimize.ts)',
    note: 'Bütçe ve kısıtlar altında dağılma süresini en aza indiren plan; simülasyonla doğrulandı.',
  },
  {
    id: 'synthetic',
    title: 'Sentetik üretim',
    note: 'Yayınlanmış günlük toplamlardan model tarafından üretildi (gün içi dağılım, varış istasyonları).',
  },
];

/** 2019 değerlerini 2022 düzeyine taşıma katsayısı: 912 000 / 1 266 000 */
export const SCALE_2019_TO_2022 = 912_000 / 1_266_000;
