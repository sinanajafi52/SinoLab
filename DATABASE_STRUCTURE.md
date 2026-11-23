# Frog Pump - Database Structure (Final)

**Root:** `devices/{DEVICE_ID}/`

```text
├── identity/
├── connection/
├── tubeConfig/
├── maintenance/
├── liveStatus/
├── rpmDispense/
└── volumeDispense/
```

---

## 📁 identity/
*اطلاعات ثابت دستگاه - یکبار در بوت نوشته می‌شود*

| Parameter | Type | Values | Board | Web App | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `mac` | string | "30:C6:F7:41:2D:E0" | ✍️ WRITE | 👁️ READ | آدرس MAC سخت‌افزاری |
| `firmware` | string | "v1.0.3" | ✍️ WRITE | 👁️ READ | نسخه فریمور |

---

## 📁 connection/
*وضعیت اتصال - Board هر ۳۰ ثانیه heartbeat می‌فرستد*

| Parameter | Type | Values | Board | Web App | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `online` | boolean | true / false | ✍️ WRITE | 👁️ READ | وضعیت آنلاین بودن |
| `ip` | string | "192.168.1.105" | ✍️ WRITE | 👁️ READ | آدرس IP محلی |
| `lastSeen` | number | Timestamp (ms) | ✍️ WRITE | 👁️ READ | آخرین زمان حضور (Unix) |

💡 **Web App Logic:** دستگاه فقط وقتی Online است که `online == true` **و** `serverNow - lastSeen < 90000` (سه heartbeat از دست رفته) باشد — `Utils.isDeviceOnline()`.
`online` به‌تنهایی کافی نیست: با قطع برق `true` باقی می‌ماند.
اگر `lastSeen` کوچکتر از `1e12` باشد (دستگاه هنوز ساعت NTP ندارد و uptime می‌نویسد)، داشبورد با دیدن تغییر `connection/` تشخیص می‌دهد.
وب‌اپ دیگر روی `connection/` چیزی نمی‌نویسد.

---

## 📁 tubeConfig/
*تنظیمات کالیبراسیون - فقط از منوی فیزیکی دستگاه قابل تغییر است*

| Parameter | Type | Values | Board | Web App | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `tubeName` | string | "None", "2mm", etc | ✍️ WRITE | 👁️ READ | نام تیوب |
| `mlPerRev` | number | 0.1 - 5.0 | ✍️ WRITE | 👁️ READ | فاکتور کالیبراسیون (mL/Rev) |
| `calibrationType` | string | "basic", "advanced" | ✍️ WRITE | 👁️ READ | نوع کالیبراسیون |
| `lastCalibrated` | number | Timestamp | ✍️ WRITE | 👁️ READ | زمان آخرین کالیبراسیون |
| `antiDrip` | boolean | true / false | ✍️ WRITE | 👁️ READ | وضعیت Anti-drip |

⚠️ **Note:** Web App فقط نمایش می‌دهد. تغییرات فقط از روی دستگاه (امنیت کالیبراسیون).

---

## 📁 maintenance/
*اطلاعات نگهداری*

| Parameter | Type | Values | Board | Web App | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `lastTubeChange` | number | Timestamp (ms) | 👁️ READ | ✍️ WRITE | زمان آخرین تعویض تیوب |
| `tubeRuntimeSeconds` | number | 0 - ∞ | ✍️ WRITE | ✍️ WRITE (فقط ریست به 0) | کارکرد از آخرین تعویض (ثانیه) |
| `totalRuntimeSeconds`| number | 0 - ∞ | ✍️ WRITE | 👁️ READ | کل کارکرد دستگاه (ثانیه) |

📝 **Logic:** شمارنده‌های runtime را **فقط دستگاه** می‌نویسد (هر ۶۰ ثانیه حین کار). وب‌اپ فقط برای نمایش بین دو آپدیت تخمین می‌زند.
(قبلاً وب‌اپ هم هر ۱۰ ثانیه می‌نوشت و runtime دو بار شمرده می‌شد.)

---

## 📁 liveStatus/
*کنترل اصلی پمپ*

| Parameter | Type | Values | Board | Web App | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `activeMode` | string | "NONE", "STATUS", "RPM", "VOLUME" | 👁️ READ | ✍️ WRITE | حالت فعلی پمپ |
| `inputMode` | string | "RPM", "FLOW" | 👁️ READ | ✍️ WRITE | نحوه ورود سرعت (فقط STATUS) |
| `currentRPM` | number | 0 - 400 | 👁️ READ | ✍️ WRITE | سرعت هدف |
| `currentFlowRate` | number | 0 - 500 / null | 👁️ READ | ✍️ WRITE | نرخ جریان (اگر کالیبره باشد) |
| `direction` | string | "CW", "CCW" | 👁️ READ | ✍️ WRITE | جهت چرخش |
| `acknowledged` | boolean | true / false | ✍️ WRITE (true) | ✍️ WRITE (false) | تأیید دریافت دستور |
| `lastIssuedBy` | string | "userId..." | 👁️ READ | ✍️ WRITE | شناسه کاربر |
| `lastUpdated` | string | ISO 8601 | 👁️ READ | ✍️ WRITE | زمان آخرین دستور |

🔄 **Workflow:**
1. **Web App:** Sets `acknowledged = false`, `activeMode = "STATUS"`.
2. **Board:** Reads change, Starts Pump, Sets `acknowledged = true`.
3. ... Pump Running ...
4. **Web App:** Sets `acknowledged = false`, `activeMode = "NONE"`.
5. **Board:** Reads change, Stops Pump, Sets `acknowledged = true`.

🧮 **Board RPM:** فریمور فقط `currentRPM` (عدد صحیح) را می‌خواند؛ `inputMode` و `currentFlowRate` فقط برای نمایش در وب‌اپ هستند. در حالت FLOW وب‌اپ خودش RPM را حساب و گرد می‌کند.

🛑 **Board writes:** دستگاه بعد از توقف محلی، پایان دیسپنس حجمی، یا fail-safe (برنچ جدید فریمور) مقدار `activeMode = "NONE"` و `acknowledged = true` می‌نویسد. وب‌اپ وضعیت پمپ را فقط از `activeMode` می‌گیرد.

---

## 📁 rpmDispense/
*پارامترهای RPM Dispense (Timed Loop)*

| Parameter | Type | Values | Board | Web App | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `rpm` | number | 0 - 400 | 👁️ READ | ✍️ WRITE | سرعت |
| `onTime` | number | 100 - 10000 (عدد صحیح) | 👁️ READ | ✍️ WRITE | مدت روشن (ms) |
| `offTime` | number | 500 - 10000 (عدد صحیح) | 👁️ READ | ✍️ WRITE | مدت خاموش (ms) — صفر مجاز نیست (وب‌اپ و Rules)، چون فریمور با `0` مقدار `onTime` را نادیده می‌گیرد و بی‌وقفه کار می‌کند |
| `direction` | string | "CW", "CCW" | 👁️ READ | ✍️ WRITE | جهت چرخش |

🔄 **Workflow:**
1. Web App: Writes params to `rpmDispense/`.
2. Web App: Sets `liveStatus/activeMode = "RPM"`.
3. Board: Reads params -> Starts Loop (On/Off).
4. Web App (Stop): Sets `liveStatus/activeMode = "NONE"`.
5. Board: Stops.

---

## 📁 volumeDispense/
*پارامترهای Volume Dispense (Volume Loop)*

| Parameter | Type | Values | Board | Web App | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `targetVolume` | number | > 0 | 👁️ READ | ✍️ WRITE | حجم هر cycle (mL) — **فیلدی که فریمور می‌خواند** |
| `offTime` | number | 0 - 10000 | 👁️ READ | ✍️ WRITE | مدت خاموش بین cycleها (ms)؛ `0` = یک‌بار |
| `direction` | string | "CW", "CCW" | 👁️ READ | ✍️ WRITE | جهت چرخش |
| `rpm`, `onTime` | number | 120 / ms | — | ✍️ WRITE | فقط اطلاعاتی (فریمور نمی‌خواند) |

🧮 **Board Calculation:** همیشه با `120 RPM`. فریمور main: زمان = `targetVolume / (mlPerRev × 2)`؛ برنچ جدید فریمور: دقیقاً `targetVolume / mlPerRev` دور (شمارش step).
⚠️ تا قبل از این اصلاح، وب‌اپ `targetVolume` را نمی‌نوشت و دیسپنس حجمی از وب عملاً کار نمی‌کرد.

✍️ **Write:** پارامترها و `liveStatus` در **یک** multi-path update اتمی نوشته می‌شوند تا دستگاه هیچ‌وقت trigger را با پارامتر قدیمی نخواند.

---

## 🛡️ Safety & Logic Rules
1. **Fail-safe (برنچ جدید فریمور):** WiFi قطع شود یا ۳۰ ثانیه poll موفق نباشد → پمپی که از وب روشن شده **AUTO-STOP**، و بعد از اتصال `activeMode = "NONE"`. (فریمور main این را ندارد.)
2. **Calibration Lock:** `tubeConfig/` فقط توسط Board نوشته می‌شود — با Rules اعمال می‌شود.
3. **Stop همیشه کار می‌کند:** در وب‌اپ حتی وقتی دستگاه Offline است (دستور در صف می‌ماند)، و روی دستگاه با کلیک روی صفحه‌ی Frog Status.

## 🔐 Security Rules (`database.rules.json`)
- کاربر وب (Google) فقط دستگاه‌هایی را می‌بیند و کنترل می‌کند که در `users/{uid}/linkedDevices` لینک کرده؛ لیست کل `devices/` برای هیچ‌کس قابل خواندن نیست.
- قبل از لینک فقط `identity/` قابل خواندن است (برای بررسی وجود دستگاه).
- دستگاه (anonymous) فقط می‌تواند گزارش بدهد و پمپ را **خاموش** کند (`activeMode = "NONE"`, `acknowledged = true`)؛ نمی‌تواند پمپ را روشن یا پارامتر دیسپنس را عوض کند.
- همه‌ی فیلدها از نظر نوع و محدوده validate می‌شوند؛ نودهای ساختار قدیمی دیگر قابل نوشتن نیستند.
- قفل `session/` در Rules هم اعمال می‌شود (فقط آزاد، مال خود کاربر، یا بدون heartbeat بیش از ۵ دقیقه).
- تست: `cd tests/rules && npm install && npm test` (Firebase Emulator، نیاز به Java).

## 🔧 Pending firmware changes (درخواست‌های سمت فریمور)
1. **احراز هویت دستگاه:** فریمور در هر بوت `signUp` ناشناس می‌کند؛ Rules نمی‌تواند دستگاه واقعی را از هر کلاینت ناشناس دیگر تشخیص دهد. پیشنهاد: حساب اختصاصی برای هر دستگاه (یا custom token) و ثبت uid دستگاه، سپس غیرفعال کردن Anonymous Auth.
2. **Pairing code:** هر کسی Device ID را بداند می‌تواند لینک کند. پیشنهاد: کد تصادفی روی صفحه‌ی System Info دستگاه + `devices/{id}/pairing/code` (فقط دستگاه می‌نویسد، هیچ‌کس نمی‌خواند) و Rule لینک که کد را چک کند. (نیاز به بند ۱ دارد.)
3. ~~RPM Dispense با `offTime = 0`~~ — حل شد سمت وب: حداقل Off Time در وب‌اپ و Rules برابر ۰.۵ ثانیه است (مثل صفحه‌ی RPM Dispense خود دستگاه). تغییری در فریمور لازم نیست.
4. **ریست runtime بعد از تعویض تیوب از بین می‌رود:** دستگاه `lastTubeChange` را فقط هنگام اتصال و با `getInt` (سرریز برای میلی‌ثانیه) می‌خواند و شمارنده‌ی محلی خودش را هر ۶۰ ثانیه روی صفر وب‌اپ می‌نویسد. باید دوره‌ای و به‌صورت double خوانده شود.
5. **`lastSeen` با زمان سرور:** به‌جای ساعت محلی (که قبل از NTP عدد uptime است) از server timestamp (`setTimestampAsync`) استفاده شود.
6. **دقت runtime:** هر ۶۰ ثانیه فقط اگر پمپ در همان لحظه روشن باشد ۶۰ ثانیه اضافه می‌شود؛ باید زمان واقعی کارکرد شمرده شود.
7. **پیش‌فرض خطرناک:** اگر خواندن `rpm` شکست بخورد پمپ با ۱۰۰ RPM روشن می‌شود؛ بهتر است دستور رد شود. خواندن `liveStatus` هم بهتر است در یک درخواست (JSON) باشد.
8. **Polling هر ۲ ثانیه** → stream یا task جدا روی core دیگر.
9. **RPM اعشاری:** فریمور `currentRPM` را int می‌خواند؛ در حالت FLOW دقت جریان به‌خاطر گرد کردن کم می‌شود.
10. فایل قدیمی `firebase-rules.json` در ریپوی فریمور با ساختار فعلی هم‌خوانی ندارد؛ مرجع Rules این ریپو است.

---

## ❌ Removed Items (v2.0 Cleanup)
*   `maintenance/preFlushEnabled`: Removed (Board logic only).
*   `liveStatus/sessionDispensed`: Removed (Calculated locally by Web App).
*   `activeMode = "PREFLUSH"`: Removed from DB trigger? (See feedback below).

---

# 💡 Developer Feedback & Review

نظر من در مورد این ساختار:
این ساختار **بسیار عالی و استاندارد** است. تفکیک وظایف (Separation of Concerns) به خوبی رعایت شده است:
1.  **تفکیک کانفیگ از وضعیت:** `tubeConfig` جدا از `liveStatus` است که امنیت کالیبراسیون را بالا می‌برد.
2.  **مدل دستوری (Command Pattern):** استفاده از پارامترهای جداگانه برای Dispense (`rpmDispense`, `volumeDispense`) و یک تریگر مرکزی (`activeMode`) باعث می‌شود لاجیک برد ساده و خطی باشد.
3.  **بهینه‌سازی ترافیک:** حذف شمارنده‌های لحظه‌ای مثل `sessionDispensed` از دیتابیس و محاسبه آن در کلاینت (Web App) تصمیم درستی برای کاهش ترافیک شبکه است.

### ⚠️ نکات مهم برای توجه (Critical Points):

1.  **Active Mode "PREFLUSH":**
    *   شما در لیست "حذف شده‌ها" نوشتید: `activeMode = "PREFLUSH"`.
    *   **چالش:** در حال حاضر Web App دکمه‌ای دارد به نام "Pre-Flush". اگر این مود از `liveStatus` حذف شود، Web App راهی برای استارت زدن Flush نخواهد داشت (مگر اینکه این دکمه کلا حذف شود یا مکانیزم دیگری داشته باشد).
    *   **پیشنهاد:** اگر می‌خواهید دکمه Pre-Flush در وب کار کند، بهتر است `PREFLUSH` همچنان به عنوان یک Enum معتبر در `activeMode` باقی بماند تا وب‌اپ بتواند درخواست آن را صادر کند.

2.  **Runtime Updates:**
    *   در بخش Maintenance نوشتید: "Web App هر ثانیه runtimeها را افزایش می‌دهد".
    *   **نکته فنی:** نوشتن در دیتابیس "هر ثانیه" (1Hz Write) ممکن است در اینترنت‌های ضعیف باعث لگ شود.
    *   **وضعیت فعلی کد:** کدی که نوشتم هر **۱۰ ثانیه** یکبار (Batch Update) عدد نهایی را در دیتابیس ذخیره می‌کند، اما در UI هر ثانیه شمارنده را بالا می‌برد. این روش بهینه‌تر است و پیشنهاد می‌کنم همین رویه ۱۰ ثانیه حفظ شود (مگر اینکه Real-time بودن ثانیه‌ای Maintenance حیاتی باشد).

در کل، امتیاز این ساختار **۱۰/۱۰** است. با رفع ابهام کوچک در مورد Pre-Flush، کاملاً آماده پیاده‌سازی است.
