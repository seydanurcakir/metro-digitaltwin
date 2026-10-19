# Metro İkizi

**Canlı demo: [metro-digitaltwin.netlify.app](https://metro-digitaltwin.netlify.app)**

Stockholm metrosu Kırmızı Hat T14 (Fruängen – Mörby centrum) için simülasyonla çalışan dijital ikiz. Ana ölçüt: **peron dağılma süresi**, yani perona gelenlerin %90'ının trene binip perondan ayrılma süresi.

```bash
npm install
npm test        # veri modeli + simülasyon + uygulama + optimizasyon testleri
npm run dev     # 3B sahneyi tarayıcıda aç
npm run build   # tek dosyalık sayfa: dist/
```

## Canlıya alma (Netlify, ücretsiz)

Depodaki `netlify.toml` gerekli ayarları içerir: derleme komutu `npm run build`, yayın klasörü `dist`, Node 20.

1. [app.netlify.com](https://app.netlify.com) → **Add new project** → **Import an existing project** → **GitHub**
2. `metro-digitaltwin` deposunu seçin; ayarlar dosyadan otomatik gelir → **Deploy**
3. Site adını **Project configuration → Change project name** ile değiştirebilirsiniz (ör. `metro-ikizi.netlify.app`)

Depoya her gönderimde site kendiliğinden yeniden derlenir.

## Adım 6: Optimizasyon (`src/opt/optimize.ts`)

Her 15 dakikalık dilim için sefer aralığı (4 / 5 / 6 / 7,5 / 10 dk) ve tren uzunluğu (2 / 3 ünite) seçer.

- **Amaç:** yolcu ağırlıklı dağılma süresini en aza indirmek.
- **Bütçe:** toplam ünite-sefer ≤ mevcut tarife (ek işletme maliyeti yok).
- **Kısıtlar:** ortak gövde (T13 + T14 ≤ 24 tren/saat), filo (54 ünite), en kısa ve en uzun sefer aralığı, vagon doluluğu ≤ %90, peron yoğunluğu ≤ 2,0 kişi/m².
- **Yöntem:** çoklu seçimli sırt çantası problemi, dinamik programlamayla kesin çözüm. Ardından simülasyonla doğrulama: sınırı aşan dilimde ve kendinden önceki iki dilimde kapasite payı artırılıp yeniden çözülür. Trenler merkeze son duraktan ~20 dakikada vardığı için önlem önceden başlar.

```bash
npm run optimize   # src/data/optimized-plans.json dosyasını yeniden üretir
```

| | Mevcut | Önerilen |
|---|---|---|
| Normal gün, akşam T-Centralen dağılma süresi | 9:00 | 3:30 |
| Akşam kalabalığı (21:00, +3 000), T-Centralen | 29:45 | 4:45 |
| Akşam kalabalığı, en yüksek peron yoğunluğu | 2,73 | 1,70 kişi/m² |
| İşletme (ünite-sefer / gün) | 1 104 | 1 044 – 1 050 |

Sonuçlar sentetik talebe dayanır; gerçek turnike verisiyle optimizasyon yeniden çalıştırılmalıdır.

## Adım 5: Ölçütler, karşılaştırma, inceleme

- **Ölçüt şeridi (üstte):** seçili planın içinde bulunulan 15 dakikadaki dağılma süresi, ortalama bekleme, peron yoğunluğu, vagon doluluğu ve hattaki tren sayısı; her biri diğer plana göre farkıyla.
- **Karşılaştırma sekmesi:** zaman penceresi (bu 15 dk, sabah zirvesi, öğle, akşam zirvesi, akşam, tüm gün) ve kapsam (T-Centralen / tüm hat) filtreleri; 6 ölçütün tablosu; gün boyu dağılma süresi grafiği; içinde bulunulan dilimin sefer planı.
- Tüm sayılar `app/twin/metrics.ts` üzerinden simülasyondan hesaplanır; elle yazılmış sayı yoktur.
- Diğer plan ve senaryoların simülasyonu sayfa açıldıktan sonra boşta kalan zamanda önceden hesaplanır.
- `scripts/test-app.ts`: sahnenin ve panellerin okuduğu fonksiyonların simülasyonla tutarlılığı, kare başına hesap maliyeti (60 FPS bütçesi).

---


## Adım 4: Tıkla ve incele

| Tıklanan | Panel |
|---|---|
| Tren | Sefer kodu, yön, uzunluk/kapasite, T-Centralen'de inen/binen, kalkış doluluğu, hat boyunca doluluk grafiği, trenin şu anki yeri |
| Peronun bir yarısı | Bekleyen kişi, yoğunluk ve sınır, son 30 dakikanın grafiği, gelecek 3 tren ve doluluğu, trene sığmayacak yolcu |
| Yürüyen merdiven | Perona inen ve perondan çıkan akış (kişi/dk) |
| İstasyon tabelası | İstasyon verileri ve her değerin kaynağı (yayın / hesaplanmış / varsayım / sentetik) |

Seçim Zustand'da (`selection`), hesaplar `app/twin/inspect.ts` içinde saf fonksiyonlar. Sürükleme tıklama sayılmaz; boşluğa tıklamak seçimi kaldırır.

## Adım 3: 3B sahne (`app/`)

React + React Three Fiber + Zustand. Unity ya da oyun motoru yok; tarayıcıda çalışır.

```bash
npm run dev     # geliştirme sunucusu
npm run build   # tek dosya: dist/index.html ve dist/t-centralen-ikizi.html
```

| Klasör | Görevi |
|---|---|
| `app/twin/model.ts` | Veri setini kurar, simülasyonu plan × senaryo için bir kez çalıştırıp saklar |
| `app/twin/layout.ts` | İstasyon ölçüleri veriden: peron uzunluğu/alanı, ray eksenleri, merdivenler |
| `app/twin/selectors.ts` | Saf fonksiyonlar: t anında perondaki kişi, trenlerin konumu, sonraki tren |
| `app/twin/store.ts` | Zaman, oynatma, hız, plan, senaryo (Zustand) |
| `app/scene/` | Yalnızca çizim: istasyon, trenler, kalabalık + ısı haritası. İş mantığı yok |
| `app/hud/` | Saat, kontroller, canlı okuma, lejant |

Kural: sahne bileşenleri sayı hesaplamaz, `selectors.ts`'den okur. Veri modeli dosyalarına (`src/data`) dokunulmadı; motora yalnızca yön bazında kuyruk alanı (`queueAfter`) eklendi.

Stockholm metrosu Kırmızı Hat T14 (Fruängen – Mörby centrum) için dijital ikizin veri katmanı. Arayüz yok; 3D sahne ve simülasyon yalnızca `buildDataset()` çıktısını okuyacak.

## Çalıştırma

```bash
npm install
npm run typecheck   # TypeScript tip kontrolü
npm run validate    # veri modeli testleri + özet rapor
npm run sim         # simülasyon testleri + plan karşılaştırma raporu
```

## Adım 2: Simülasyon motoru (`src/sim/`)

Olay tabanlı, mezoskopik bir model. Bir günün tamamı yaklaşık 0,1 saniyede simüle ediliyor.

1. **Tarife:** Sefer planından iki son duraktan kalkışlar üretilir. Trenler istasyonlar arası süre ve kapı açık süresiyle ilerler. 05:00'te trenler hat boyunca dağılmış olsun diye ilk seferler önceden başlar.
2. **Peron:** Yolcular 30 saniyelik gruplar halinde perona gelir ve yönlerine göre sıraya girer (FIFO).
3. **Tren gelince:** Önce o istasyonda inecekler iner, sonra sıradakiler kapasite dolana kadar biner. Binen yolcunun varış istasyonu talep modelindeki dağılıma göre belirlenir.
4. **Kayıt:** Her binişte bekleme süresi, her durakta peron doluluğu ve tren yükü kaydedilir.

`simulate(dataset, plan, { demandMultiplier, surges, boardingLimitFactor })`: `surges` belirli bir istasyon ve zamana ani kalabalık ekler (maç çıkışı gibi).

### Ölçütler (`computeKpis`)

| Ölçüt | Tanım |
|---|---|
| Dağılma süresi P90 (ana ölçüt) | Perona gelenlerin %90'ının trene binip perondan ayrılma süresi |
| Ortalama bekleme | Yolcu başına peronda geçen ortalama süre |
| En yüksek doluluk | Kalkışta tren yükü / kapasite (sınır %90) |
| Peron yoğunluğu | Tren gelmeden hemen önce kişi/m² (sınır 2,0) |
| Geride kalan | Trene sığamayıp bir sonrakini bekleyen yolcu (kişi-kez) |

Ölçütler zaman penceresi ve istasyon bazında alınabilir. `slotSeries` 15 dakikalık seriler, `platformTrace` bir istasyonun peron doluluk izini verir; ikisi de grafikler için.

### Testler

Korunum (gelen = binen + bekleyen, binen = inen), kapasite aşılmaması, sınırsız kapasitede beklemenin sefer aralığını aşmaması, determinizm, sık seferin beklemeyi artırmaması, talep ×3 stres testi, ani kalabalık testleri.

## Dosyalar

| Dosya | İçerik |
|---|---|
| `src/types.ts` | Tüm tipler: hat, istasyon, peron, tren, talep, sefer planı, kısıtlar, ölçütler |
| `src/data/sources.ts` | Kaynak listesi |
| `src/data/line-t14.ts` | 19 istasyon, 18 bölüm, günlük binişler, peronlar, ortak gövde |
| `src/data/fleet.ts` | C20 ünitesi (414 kişi), kısa/uzun tren, filo |
| `src/data/time.ts` | 05:00–01:00 arası 80 adet 15 dakikalık dilim, gün içi talep eğrisi |
| `src/data/demand.ts` | Dilim × istasyon × yön talebi ve varış istasyonu dağılımı |
| `src/data/plans.ts` | Mevcut tarife, deneme planı, T13 trafiği, kısıtlar |
| `scripts/validate.ts` | Testler |

## Her sayının bir kaynağı var

Her değer `{ value, src }` olarak tutulur. `src.kind` dört türden biridir:

- `published`: resmi yayından (SL yıllık raporu, Wikipedia)
- `derived`: yayınlanmış değerlerden hesaplanmış
- `assumption`: varsayım, gerçek veriyle değiştirilmeli
- `synthetic`: model tarafından üretilmiş

## Talep nasıl üretiliyor?

1. **Günlük biniş (yayın):** SL 2022 raporu. Aktarma istasyonlarında 2019 Kırmızı Hat değeri × 0,72 (2022/2019 metro toplam oranı).
2. **T14 payı:** Ortak gövdede (Liljeholmen–Östermalmstorg) T13 ile eşit paylaşım, %50.
3. **Gün içi dağılım (sentetik):** 08:00 ve 16:45 zirveli eğri.
4. **Yön ve varış (çekim modeli):** Yolcu, her istasyona o istasyonun biniş sayısıyla orantılı olasılıkla gider.

## Değiştirilmesi gereken başlıca varsayımlar

- İstasyonlar arası süreler → Trafiklab GTFS tarifesi
- Peron alanları → istasyon planları
- Gün içi talep eğrisi → turnike verisi
- Sabah/akşam yön dengesizliği → şu an yok, zirve yükü olduğundan düşük görünüyor
- T14'e ayrılan filo, ünite sayıları
