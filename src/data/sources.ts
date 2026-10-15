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
