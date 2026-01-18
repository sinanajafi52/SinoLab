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
*وضعیت اتصال - Board هر ۵ ثانیه آپدیت می‌کند*

| Parameter | Type | Values | Board | Web App | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `online` | boolean | true / false | ✍️ WRITE | 👁️ READ | وضعیت آنلاین بودن |
| `ip` | string | "192.168.1.105" | ✍️ WRITE | 👁️ READ | آدرس IP محلی |
| `lastSeen` | number | Timestamp (ms) | ✍️ WRITE | 👁️ READ | آخرین زمان حضور (Unix) |

💡 **Web App Logic:** اگر `Date.now() - lastSeen > 15000` باشد، دستگاه Offline فرض می‌شود.

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
*اطلاعات نگهداری - Web App مدیریت می‌کند*

| Parameter | Type | Values | Board | Web App | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `lastTubeChange` | number | Timestamp | 👁️ READ | ✍️ WRITE | زمان آخرین تعویض تیوب |
| `tubeRuntimeSeconds` | number | 0 - ∞ | 👁️ READ | ✍️ WRITE | کارکرد از آخرین تعویض (ثانیه) |
| `totalRuntimeSeconds`| number | 0 - ∞ | 👁️ READ | ✍️ WRITE | کل کارکرد دستگاه (ثانیه) |

📝 **Logic:** Web App هنگامی که `activeMode != "NONE"` است، هر ثانیه runtimeها را افزایش می‌دهد.

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

🧮 **Board RPM Calculation:**
```cpp
if (inputMode == "FLOW") {
    RPM = currentFlowRate / tubeConfig.mlPerRev;
} else {
    RPM = currentRPM;
}
```

---

## 📁 rpmDispense/
*پارامترهای RPM Dispense (Timed Loop)*

| Parameter | Type | Values | Board | Web App | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `rpm` | number | 0 - 400 | 👁️ READ | ✍️ WRITE | سرعت |
| `onTime` | number | 500 - 10000 | 👁️ READ | ✍️ WRITE | مدت روشن (ms) |
| `offTime` | number | 500 - 10000 | 👁️ READ | ✍️ WRITE | مدت خاموش (ms) |
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
| `targetVolume` | number | 0.1 - 999 | 👁️ READ | ✍️ WRITE | حجم هر cycle (mL) |
| `offTime` | number | 500 - 10000 | 👁️ READ | ✍️ WRITE | مدت خاموش بین cycleها (ms) |
| `direction` | string | "CW", "CCW" | 👁️ READ | ✍️ WRITE | جهت چرخش |

🧮 **Board Calculation:**
```cpp
revolutions = targetVolume / tubeConfig.mlPerRev;
// Calculate duration based on max speed or current setting
```

---

## 🛡️ Safety & Logic Rules
1. **WiFi Timeout:** Board > 15s without connection + `activeMode != "NONE"` → **AUTO-STOP**.
2. **Calibration Lock:** `tubeConfig/` writable ONLY by Board (Physical UI).
3. **Control Lock:** When `online` is true, physical controls on device might be locked (optional).

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
