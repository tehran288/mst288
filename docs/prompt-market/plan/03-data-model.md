# ۰۳ — مدل داده

> پیاده‌سازی: Collectionهای Payload روی PostgreSQL. فیلدهای علامت‌دار 🌐 **محلی‌شده** هستند (یک مقدار برای هر زبان fa/en/ar).

## ۱. نمودار موجودیت‌ها

```
Category ─┐                    ┌─ ModelFamily ─ AIModel
Tag ──────┼─< Prompt >─────────┤
Source ───┘     │  │           └─ TestRun >─ TestResult
                │  └─< PromptVersion
                ├─< Example (نمونه‌خروجی)
                ├─< Review
                └─< BundleItem >─ Bundle
User ─< Order >─ OrderItem ─> (Prompt | Bundle | Plan | CreditPack)
User ─< Subscription >─ Plan
User ─< CreditLedger
User ─< Entitlement (چه چیزی را مالک است)
User ─< RunLog (اجرای پرامپت در سایت)
SearchLog · DemandSignal · Coupon · Affiliate · Payout · Job · AuditLog
```

## ۲. موجودیت‌های اصلی

### Prompt
| فیلد | نوع | توضیح |
|---|---|---|
| `id`, `slug` 🌐 | | slug جدا برای هر زبان (سئو) |
| `title` 🌐, `summary` 🌐, `description` 🌐 | text/richText | |
| `tier` | enum: `free`, `pro`, `premium` | رایگان / در اشتراک / فوق‌حرفه‌ای |
| `outputType` | enum: text, image, video, audio, code, automation | |
| `categories`, `tags` | relation | |
| `industries` | relation | |
| `level` | enum: beginner, pro, expert | |
| `targetModels` | relation → ModelFamily | مدل‌هایی که برای آن نوشته شده |
| `currentVersion` | relation → PromptVersion | |
| `qualityScore` | number 0–100 | محاسبه‌ی خودکار (بند ۳) |
| `status` | enum: draft, testing, review, published, needs_update, archived | |
| `source` | relation → Source | منشأ و لایسنس |
| `priceBaseUsd` | number | فقط برای فروش تکی |
| `stats` | json | views, copies, runs, sales, refunds |
| `seo` 🌐 | group | metaTitle, metaDescription, ogImage |
| `embedding` | vector(1024) | برای جست‌وجوی معنایی (ستون pgvector با migration) |
| `publishedAt`, `lastTestedAt` | date | |

### PromptVersion
| فیلد | توضیح |
|---|---|
| `prompt`, `semver` (1.3.0) | |
| `body` 🌐 | متن پرامپت با متغیرها: `{{product_name}}` |
| `variables` | آرایه: name, label 🌐, type (text/select/number), options, default, required |
| `systemPrompt` 🌐 | اختیاری |
| `changelog` 🌐 | چه چیزی عوض شد |
| `createdBy` | `ai_pipeline` / `admin` / `creator` |

### AIModel / ModelFamily
`family` (GPT, Claude, Gemini, Llama, Midjourney, Flux, Sora…)، `modelId`، `provider`، `releasedAt`، `isActiveForTesting`، `costPerRun`.
افزودن یک مدل فعال جدید = تریگر خودکار «جاروی به‌روزرسانی» (سند ۰۴، پایپ‌لاین P3).

### TestRun / TestResult
| فیلد | توضیح |
|---|---|
| `promptVersion`, `model`, `locale` | |
| `inputs` | مقادیر متغیرها برای این تست (۳ مجموعه‌ی نمونه) |
| `output` | خروجی خام (متن یا لینک تصویر) |
| `judgeScores` | json: relevance, completeness, format, language_quality, safety (۰–۱۰) |
| `passed` | boolean |
| `costUsd` | |

### Source
`type` (in_house_ai, in_house_manual, cc0_import, creator, bounty)، `url`، `license` (CC0, proprietary, CC-BY…)، `attribution`، `importedAt`، `externalId` (برای جلوگیری از واردات تکراری).

### Bundle
`title` 🌐، `items`، `priceBaseUsd`، `anchorPriceUsd` (قیمت خط‌خورده)، `coverImage`، `isLifetimeIncluded`.

### Plan (اشتراک)
`code` (pro_monthly, pro_yearly, lifetime, team)، `interval`، `prices` (به تفکیک بازار)، `monthlyCredits`، `features` 🌐.

### CreditLedger
دفتر دوطرفه: `user`، `delta` (+/−)، `reason` (subscription_grant, purchase, run, refund, bonus)، `balanceAfter`، `refId`. موجودی = مجموع؛ هرگز یک فیلد «balance» قابل‌ویرایش نداریم.

### Entitlement
`user`، `kind` (prompt, bundle, all_pro, all_premium)، `refId`، `expiresAt` (null = دائمی)، `source` (order/subscription). **همه‌ی کنترل دسترسی فقط از این جدول.**

### Order / OrderItem / Payment
`market` (IR, GLOBAL, GCC)، `currency`، `amount`، `provider`، `providerRef`، `status`، `couponCode`، `affiliate`، `invoiceNumber`.

### SearchLog / DemandSignal
- `SearchLog`: query، locale، resultsCount، clickedPromptId.
- `DemandSignal`: کلیدواژه/نیاز تجمیع‌شده با `score` (تعداد × روند)، `source` (zero_result_search, gsc_query, competitor_gap, user_request)، `status` (new, queued, fulfilled).

## ۳. امتیاز کیفیت (Quality Score)

```
QS = 100 × ( 0.35·T + 0.20·R + 0.20·C + 0.10·F + 0.10·E − 0.05·P )
```
| مؤلفه | تعریف | مقیاس ۰–۱ |
|---|---|---|
| **T** تست | میانگین امتیاز داور روی همه‌ی مدل‌های هدف × نرخ قبولی | |
| **R** رضایت | میانگین بیزی امتیاز کاربران: `(v·r + m·c)/(v+m)` با `m=10`، `c` = میانگین کل | r/5 |
| **C** تبدیل | نرخ بازدید→خرید (یا کپی برای رایگان) نسبت به صدک ۹۵ هم‌دسته | min(1, x/p95) |
| **F** تازگی | `exp(−days_since_last_test / 90)` | |
| **E** تعامل | کپی + اجرا + ذخیره، نرمال‌شده‌ی لگاریتمی در دسته | |
| **P** جریمه | نرخ بازگشت وجه + گزارش خرابی | |

- پرامپت تازه (داده‌ی رفتاری کم) با T و F شروع می‌کند و C/E مقدار پیش‌فرض میانه‌ی دسته را می‌گیرند (cold start).
- محاسبه‌ی مجدد: شبانه برای همه، فوری بعد از هر تست/نظر.
- نمایش عمومی: نشان «امتیاز ۸۷» + تفکیک «تست ۹۲ · رضایت ۴٫۶ از ۵».

## ۴. طبقه‌بندی (Taxonomy) اولیه

| محور | مقادیر نمونه |
|---|---|
| مدل | ChatGPT · Claude · Gemini · DeepSeek · Llama · Midjourney · Flux · Stable Diffusion · DALL·E/GPT-Image · Sora · Kling · Suno |
| نوع خروجی | متن · تصویر · ویدیو · صدا/موسیقی · کد · اتوماسیون (n8n/Make) · ایجنت |
| کاربرد | تولید محتوا · کپی‌رایتینگ و تبلیغات · سئو · فروش و ایمیل · شبکه‌های اجتماعی · آموزش · برنامه‌نویسی · تحلیل داده · حقوقی · منابع انسانی · طراحی لوگو و برند · عکاسی محصول · بهره‌وری شخصی |
| صنعت | فروشگاه آنلاین · املاک · رستوران · سلامت و زیبایی · آموزش · گردشگری · مالی · فناوری |
| سطح | مبتدی · حرفه‌ای · فوق‌حرفه‌ای |

برچسب‌ها 🌐 محلی‌شده‌اند و هر برچسب صفحه‌ی فرود سئوی خودش را دارد.
