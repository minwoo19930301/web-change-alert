# Chrome Web Store Listing Copy

Use these entries when updating the Chrome Web Store listing manually. The extension code only contains the short manifest description in `_locales/*/messages.json`; the full store listing text is managed in the Chrome Web Store dashboard.

## en - English

Short description:
Monitor webpage changes with exact target selection, schedules, filters, Agent AI setup, and site icons.

Detailed description:
Tired of repeatedly opening a site just to see whether one part changed? Web Change Alert checks it for you.

Open the extension popup in the browser/profile where Web Change Alert is installed, go to the site you want to monitor, select the exact target, and set the schedule once. After that, you get alerts only when the value actually changes compared with the previous value.

Key features:
- Direct target selection: text, image, SVG, canvas, attribute, link href, or input value
- Candidate picker for overlapping, nested, or nearby values
- Optional alert filters: only when text appears, disappears, or matches a repeated pattern
- Schedule setup: interval, daily, weekly, or monthly
- Alerts only on real changes, not on the same value
- Multiple-site monitoring
- Manual run per item for a quick check
- Fast re-select when collection fails
- Agent AI setup prompt for Codex, Claude Code, OpenClaw, Antigravity, and similar browser-controlling agents
- Site title and favicon saved in the popup for easier scanning

If notifications do not appear:
- macOS: System Settings > Notifications > Allow notifications for your browser helper, such as Google Chrome Helper
- Windows: Settings > Notifications (and actions) > Allow notifications for your browser

If unexpected notifications appear:
They may come from previously registered sites. Type chrome://settings/content/notifications in the address bar, then block that site or remove it from the allowed list.

Notes:
For login-required sites, keep your session signed in. Protected pages such as Cloudflare may require manual verification. Very short intervals may get your IP or account blocked by site policy.

## ko - 한국어

Short description:
웹페이지의 특정 값 변화를 선택자, 주기, 필터, Agent AI 설정으로 감시하고 사이트 아이콘과 함께 관리합니다.

Detailed description:
매번 사이트를 열어서 한 부분이 바뀌었는지 확인하기 귀찮다면 Web Change Alert이 대신 확인해줍니다.

Web Change Alert이 설치된 브라우저/프로필에서 확장 프로그램 팝업을 열고, 감시할 사이트로 이동한 뒤 원하는 값을 정확히 선택하고 주기를 한 번만 설정하세요. 이후에는 이전 값과 비교해 실제로 값이 바뀌었을 때만 알림을 받습니다.

주요 기능:
- 직접 대상 선택: 텍스트, 이미지, SVG, canvas, 속성, 링크 href, 입력값
- 겹치거나 중첩된 값, 주변 후보 중 정확한 값 선택
- 선택 알림 필터: 특정 문구가 보일 때만, 사라질 때만, 반복 패턴에 맞을 때만
- 주기 설정: 간격마다, 매일, 매주, 매월
- 같은 값이면 알림 없음, 실제 변경 시에만 알림
- 여러 사이트 동시 모니터링
- 항목별 수동 실행으로 빠른 확인
- 수집 실패 시 빠른 다시선택
- Codex, Claude Code, OpenClaw, Antigravity 같은 브라우저 조작 Agent AI용 설정 프롬프트
- 팝업에서 사이트 제목과 favicon을 저장해 더 쉽게 구분

알림이 뜨지 않는다면:
- macOS: 시스템 설정 > 알림 > 사용 중인 브라우저 Helper 알림 허용
- Windows: 설정 > 알림 및 작업 > 사용 중인 브라우저 알림 허용

이상한 알림이 뜬다면:
예전에 등록한 사이트가 계속 알림을 보낼 수 있습니다. 주소창에 chrome://settings/content/notifications 를 입력한 뒤 해당 사이트를 차단하거나 허용 목록에서 삭제하세요.

주의:
로그인이 필요한 사이트는 로그인 상태를 유지해야 합니다. Cloudflare 같은 보호 페이지는 직접 인증이 필요할 수 있습니다. 너무 짧은 주기로 반복 확인하면 사이트 정책에 따라 IP나 계정이 차단될 수 있습니다.

## ja - 日本語

Short description:
ページ内の特定値を、選択・スケジュール・フィルター・Agent AI 設定で監視します。

Detailed description:
サイトを何度も開いて一部分が変わったか確認するのに疲れていませんか？Web Change Alert が代わりに確認します。

Web Change Alert がインストールされているブラウザー/プロファイルで拡張機能ポップアップを開き、監視したいサイトへ移動し、正確な対象を選択してスケジュールを一度設定します。その後は、前回の値と比較して本当に変わったときだけ通知します。

主な機能:
- 直接対象選択: テキスト、画像、SVG、canvas、属性、リンク href、入力値
- 重なった値、ネストされた値、近くの候補から正確な値を選択
- 任意の通知フィルター: 文言が表示されたとき、消えたとき、繰り返しパターンに合うときだけ
- スケジュール設定: 間隔、毎日、毎週、毎月
- 同じ値では通知せず、本当の変更だけ通知
- 複数サイトの監視
- 項目ごとの手動実行
- 取得失敗時の素早い再選択
- Codex、Claude Code、OpenClaw、Antigravity などブラウザー操作 Agent AI 用の設定プロンプト
- サイトタイトルと favicon を保存し、ポップアップで見分けやすく表示

通知が表示されない場合:
- macOS: システム設定 > 通知 > 使用中ブラウザーの Helper 通知を許可
- Windows: 設定 > 通知とアクション > 使用中ブラウザーの通知を許可

予期しない通知が表示される場合:
以前に登録したサイトから通知が来ている可能性があります。アドレスバーに chrome://settings/content/notifications と入力し、そのサイトをブロックするか許可リストから削除してください。

注意:
ログインが必要なサイトではログイン状態を維持してください。Cloudflare などで保護されたページは手動認証が必要な場合があります。短すぎる間隔で確認すると、サイトポリシーにより IP やアカウントがブロックされる可能性があります。

## zh-CN - 简体中文

Short description:
用精准选择、周期、过滤器和 Agent AI 设置监控网页中特定内容的变化。

Detailed description:
厌倦了一遍遍打开网站，只为了确认某个部分有没有变化？Web Change Alert 可以帮你检查。

在安装了 Web Change Alert 的浏览器/配置文件中打开扩展弹窗，进入要监控的网站，选择准确的目标并设置一次周期。之后只有当新值与上一次值真正不同时才会提醒。

主要功能:
- 直接选择目标：文本、图片、SVG、canvas、属性、链接 href 或输入值
- 从重叠、嵌套或附近候选值中选择准确内容
- 可选提醒过滤：仅在文字出现、消失或匹配重复模式时提醒
- 周期设置：间隔、每天、每周、每月
- 相同值不提醒，只在真实变化时提醒
- 多站点监控
- 每个项目可手动快速检查
- 采集失败时快速重新选择
- 为 Codex、Claude Code、OpenClaw、Antigravity 等可控制浏览器的 Agent AI 提供设置提示词
- 保存网站标题和 favicon，方便在弹窗中识别

如果通知没有出现:
- macOS: 系统设置 > 通知 > 允许当前浏览器 Helper 通知
- Windows: 设置 > 通知和操作 > 允许当前浏览器通知

如果出现意外通知:
可能来自以前注册过的网站。请在地址栏输入 chrome://settings/content/notifications，然后阻止该网站或从允许列表中删除。

注意:
需要登录的网站请保持登录状态。Cloudflare 等保护页面可能需要手动验证。过短的检查间隔可能因网站政策导致 IP 或账号被限制。

## zh-TW - 繁體中文

Short description:
用精準選取、週期、篩選器和 Agent AI 設定監控網頁中特定內容的變化。

Detailed description:
厭倦了一直開網站，只為了確認某個部分有沒有變化嗎？Web Change Alert 可以幫你檢查。

在安裝了 Web Change Alert 的瀏覽器/設定檔中開啟擴充功能彈窗，前往要監控的網站，選取準確目標並設定一次週期。之後只有當新值與上一次值真正不同時才會提醒。

主要功能:
- 直接選取目標：文字、圖片、SVG、canvas、屬性、連結 href 或輸入值
- 從重疊、巢狀或附近候選值中選取準確內容
- 可選提醒篩選：僅在文字出現、消失或符合重複模式時提醒
- 週期設定：間隔、每天、每週、每月
- 相同值不提醒，只在真實變更時提醒
- 多網站監控
- 每個項目可手動快速檢查
- 擷取失敗時快速重新選取
- 為 Codex、Claude Code、OpenClaw、Antigravity 等可控制瀏覽器的 Agent AI 提供設定提示詞
- 儲存網站標題和 favicon，方便在彈窗中辨識

如果通知沒有出現:
- macOS: 系統設定 > 通知 > 允許目前瀏覽器 Helper 通知
- Windows: 設定 > 通知與動作 > 允許目前瀏覽器通知

如果出現非預期通知:
可能來自以前註冊過的網站。請在網址列輸入 chrome://settings/content/notifications，然後封鎖該網站或從允許清單中移除。

注意:
需要登入的網站請保持登入狀態。Cloudflare 等保護頁面可能需要手動驗證。過短的檢查間隔可能因網站政策導致 IP 或帳號被限制。

## es - Español

Short description:
Monitoriza cambios en páginas con selección exacta, horarios, filtros y configuración con Agent AI.

Detailed description:
¿Cansado de abrir una web una y otra vez solo para comprobar si una parte cambió? Web Change Alert lo revisa por ti.

Abre el popup de la extensión en el navegador/perfil donde Web Change Alert está instalado, visita el sitio que quieres monitorizar, selecciona el objetivo exacto y configura el horario una vez. Después recibirás alertas solo cuando el valor cambie realmente respecto al valor anterior.

Funciones principales:
- Selección directa: texto, imagen, SVG, canvas, atributo, href de enlace o valor de input
- Selector de candidatos para valores superpuestos, anidados o cercanos
- Filtros opcionales: solo cuando aparece texto, desaparece o coincide con un patrón repetido
- Horarios: intervalo, diario, semanal o mensual
- Alertas solo en cambios reales, no si el valor es igual
- Monitorización de varios sitios
- Ejecución manual por elemento
- Re-selección rápida si falla la recopilación
- Prompt de configuración para Agent AI como Codex, Claude Code, OpenClaw, Antigravity y similares
- Guarda título y favicon del sitio para identificarlo mejor en el popup

Si no aparecen notificaciones:
- macOS: Ajustes del sistema > Notificaciones > Permitir notificaciones del helper de tu navegador
- Windows: Configuración > Notificaciones y acciones > Permitir notificaciones de tu navegador

Si aparecen notificaciones inesperadas:
Pueden venir de sitios registrados anteriormente. Escribe chrome://settings/content/notifications en la barra de direcciones y bloquea ese sitio o elimínalo de la lista permitida.

Notas:
Los sitios que requieren inicio de sesión necesitan una sesión activa. Páginas protegidas como Cloudflare pueden requerir verificación manual. Intervalos muy cortos pueden hacer que el sitio bloquee tu IP o cuenta.

## ru - Русский

Short description:
Отслеживайте изменения на страницах с точным выбором, расписанием, фильтрами и Agent AI.

Detailed description:
Надоело снова и снова открывать сайт, чтобы проверить, изменилась ли одна часть страницы? Web Change Alert сделает это за вас.

Откройте popup расширения в браузере/профиле, где установлен Web Change Alert, перейдите на нужный сайт, выберите точный элемент и один раз настройте расписание. После этого уведомления будут приходить только когда значение действительно изменится по сравнению с предыдущим.

Основные возможности:
- Прямой выбор цели: текст, изображение, SVG, canvas, атрибут, href ссылки или значение input
- Выбор кандидатов для перекрывающихся, вложенных или соседних значений
- Дополнительные фильтры: только когда текст появился, исчез или совпал с повторяющимся шаблоном
- Расписание: интервал, ежедневно, еженедельно или ежемесячно
- Уведомления только при реальных изменениях
- Мониторинг нескольких сайтов
- Ручной запуск для быстрой проверки
- Быстрый повторный выбор при ошибке сбора
- Prompt настройки для Agent AI, таких как Codex, Claude Code, OpenClaw, Antigravity и похожих инструментов
- Сохраняет заголовок сайта и favicon для удобного просмотра в popup

Если уведомления не появляются:
- macOS: Системные настройки > Уведомления > Разрешите уведомления helper вашего браузера
- Windows: Параметры > Уведомления и действия > Разрешите уведомления браузера

Если появляются неожиданные уведомления:
Они могут приходить от ранее зарегистрированных сайтов. Введите chrome://settings/content/notifications в адресную строку, затем заблокируйте сайт или удалите его из разрешенного списка.

Примечания:
Для сайтов с входом сохраняйте активную сессию. Защищенные страницы, например Cloudflare, могут требовать ручной проверки. Слишком короткие интервалы могут привести к блокировке IP или аккаунта по правилам сайта.

## fr - Français

Short description:
Surveillez les changements de pages avec sélection précise, horaires, filtres et configuration Agent AI.

Detailed description:
Fatigué d’ouvrir un site encore et encore juste pour voir si une partie a changé ? Web Change Alert le vérifie pour vous.

Ouvrez le popup de l’extension dans le navigateur/profil où Web Change Alert est installé, allez sur le site à surveiller, sélectionnez la cible exacte et définissez le calendrier une seule fois. Ensuite, vous recevez des alertes uniquement lorsque la valeur change réellement par rapport à la précédente.

Fonctionnalités principales:
- Sélection directe: texte, image, SVG, canvas, attribut, href de lien ou valeur de champ
- Sélecteur de candidats pour valeurs superposées, imbriquées ou proches
- Filtres facultatifs: seulement quand un texte apparaît, disparaît ou correspond à un motif répété
- Calendrier: intervalle, quotidien, hebdomadaire ou mensuel
- Alertes uniquement sur de vrais changements
- Surveillance de plusieurs sites
- Exécution manuelle par élément
- Re-sélection rapide en cas d’échec de collecte
- Prompt de configuration pour Agent AI comme Codex, Claude Code, OpenClaw, Antigravity et similaires
- Enregistre le titre du site et le favicon pour mieux identifier les éléments dans le popup

Si les notifications n’apparaissent pas:
- macOS: Réglages système > Notifications > Autoriser les notifications du helper de votre navigateur
- Windows: Paramètres > Notifications et actions > Autoriser les notifications de votre navigateur

Si des notifications inattendues apparaissent:
Elles peuvent venir de sites enregistrés auparavant. Tapez chrome://settings/content/notifications dans la barre d’adresse, puis bloquez ce site ou supprimez-le de la liste autorisée.

Notes:
Pour les sites nécessitant une connexion, gardez votre session active. Les pages protégées comme Cloudflare peuvent nécessiter une vérification manuelle. Des intervalles trop courts peuvent entraîner le blocage de votre IP ou compte selon la politique du site.

## de - Deutsch

Short description:
Überwache Webseitenänderungen mit genauer Auswahl, Zeitplan, Filtern und Agent-AI-Einrichtung.

Detailed description:
Müde davon, eine Website immer wieder zu öffnen, nur um zu sehen, ob sich ein Teil geändert hat? Web Change Alert prüft das für dich.

Öffne das Erweiterungs-Popup im Browser/Profil, in dem Web Change Alert installiert ist, gehe zur gewünschten Website, wähle das genaue Ziel aus und lege den Zeitplan einmal fest. Danach erhältst du Benachrichtigungen nur, wenn sich der Wert im Vergleich zum vorherigen Wert wirklich geändert hat.

Hauptfunktionen:
- Direkte Zielauswahl: Text, Bild, SVG, canvas, Attribut, Link-href oder Eingabewert
- Kandidatenauswahl für überlappende, verschachtelte oder nahe Werte
- Optionale Filter: nur wenn Text erscheint, verschwindet oder einem wiederkehrenden Muster entspricht
- Zeitplan: Intervall, täglich, wöchentlich oder monatlich
- Benachrichtigungen nur bei echten Änderungen
- Überwachung mehrerer Websites
- Manueller Lauf pro Eintrag
- Schnelle Neuauswahl bei Sammelfehlern
- Einrichtungs-Prompt für Agent AI wie Codex, Claude Code, OpenClaw, Antigravity und ähnliche Tools
- Speichert Seitentitel und favicon für bessere Übersicht im Popup

Wenn Benachrichtigungen nicht erscheinen:
- macOS: Systemeinstellungen > Mitteilungen > Benachrichtigungen für den Helper deines Browsers erlauben
- Windows: Einstellungen > Benachrichtigungen und Aktionen > Browser-Benachrichtigungen erlauben

Wenn unerwartete Benachrichtigungen erscheinen:
Sie können von zuvor registrierten Websites stammen. Gib chrome://settings/content/notifications in die Adressleiste ein und blockiere die Website oder entferne sie aus der Zulassungsliste.

Hinweise:
Bei Login-Websites muss die Sitzung angemeldet bleiben. Geschützte Seiten wie Cloudflare können manuelle Verifizierung erfordern. Sehr kurze Intervalle können nach Website-Richtlinie zur Blockierung deiner IP oder deines Kontos führen.

## pt-BR - Português (Brasil)

Short description:
Monitore mudanças em páginas com seleção exata, agenda, filtros e configuração por Agent AI.

Detailed description:
Cansado de abrir um site repetidamente só para ver se uma parte mudou? Web Change Alert verifica por você.

Abra o popup da extensão no navegador/perfil em que o Web Change Alert está instalado, vá ao site que deseja monitorar, selecione o alvo exato e configure a agenda uma vez. Depois disso, você recebe alertas somente quando o valor realmente muda em relação ao valor anterior.

Principais recursos:
- Seleção direta: texto, imagem, SVG, canvas, atributo, href de link ou valor de input
- Lista de candidatos para valores sobrepostos, aninhados ou próximos
- Filtros opcionais: somente quando um texto aparece, desaparece ou segue um padrão repetido
- Agenda: intervalo, diário, semanal ou mensal
- Alertas apenas em mudanças reais
- Monitoramento de vários sites
- Execução manual por item
- Re-seleção rápida quando a coleta falha
- Prompt de configuração para Agent AI como Codex, Claude Code, OpenClaw, Antigravity e similares
- Salva título e favicon do site para facilitar a leitura no popup

Se as notificações não aparecerem:
- macOS: Ajustes do Sistema > Notificações > Permitir notificações do helper do seu navegador
- Windows: Configurações > Notificações e ações > Permitir notificações do navegador

Se aparecerem notificações inesperadas:
Elas podem vir de sites registrados anteriormente. Digite chrome://settings/content/notifications na barra de endereço e bloqueie o site ou remova-o da lista permitida.

Observações:
Sites que exigem login precisam manter a sessão conectada. Páginas protegidas, como Cloudflare, podem exigir verificação manual. Intervalos muito curtos podem fazer com que o site bloqueie seu IP ou conta.

## it - Italiano

Short description:
Monitora cambiamenti nelle pagine con selezione precisa, pianificazione, filtri e Agent AI.

Detailed description:
Stanco di aprire ripetutamente un sito solo per vedere se una parte è cambiata? Web Change Alert controlla per te.

Apri il popup dell’estensione nel browser/profilo in cui Web Change Alert è installato, vai al sito da monitorare, seleziona il target esatto e imposta la pianificazione una sola volta. Dopo riceverai avvisi solo quando il valore cambia davvero rispetto al valore precedente.

Funzioni principali:
- Selezione diretta: testo, immagine, SVG, canvas, attributo, href link o valore input
- Selettore candidati per valori sovrapposti, annidati o vicini
- Filtri opzionali: solo quando un testo appare, scompare o segue uno schema ripetuto
- Pianificazione: intervallo, giornaliera, settimanale o mensile
- Avvisi solo su cambiamenti reali
- Monitoraggio di più siti
- Esecuzione manuale per elemento
- Riselezione rapida quando la raccolta fallisce
- Prompt di configurazione per Agent AI come Codex, Claude Code, OpenClaw, Antigravity e simili
- Salva titolo e favicon del sito per una lettura più facile nel popup

Se le notifiche non appaiono:
- macOS: Impostazioni di Sistema > Notifiche > Consenti notifiche per l’helper del browser
- Windows: Impostazioni > Notifiche e azioni > Consenti notifiche del browser

Se appaiono notifiche inattese:
Possono provenire da siti registrati in precedenza. Digita chrome://settings/content/notifications nella barra degli indirizzi, poi blocca quel sito o rimuovilo dalla lista consentita.

Note:
Per siti che richiedono login, mantieni la sessione attiva. Pagine protette come Cloudflare possono richiedere verifica manuale. Intervalli troppo brevi possono causare il blocco del tuo IP o account secondo la policy del sito.

## ar - العربية

Short description:
راقب تغييرات صفحات الويب باختيار دقيق وجدولة وفلاتر وإعداد عبر Agent AI.

Detailed description:
هل تعبت من فتح الموقع مرارًا فقط لتعرف هل تغيّر جزء واحد منه؟ Web Change Alert يتحقق بدلًا منك.

افتح نافذة الإضافة في المتصفح/الملف الشخصي الذي تم تثبيت Web Change Alert فيه، وانتقل إلى الموقع الذي تريد مراقبته، ثم اختر الهدف بدقة واضبط الجدولة مرة واحدة. بعد ذلك ستصلك التنبيهات فقط عندما تتغير القيمة فعلًا مقارنة بالقيمة السابقة.

الميزات الرئيسية:
- اختيار مباشر للهدف: نص، صورة، SVG، canvas، خاصية، href لرابط، أو قيمة input
- اختيار من مرشحات قريبة أو متداخلة أو متراكبة
- فلاتر تنبيه اختيارية: فقط عند ظهور نص، أو اختفائه، أو مطابقته لنمط متكرر
- جدولة: حسب interval، يوميًا، أسبوعيًا، أو شهريًا
- تنبيهات عند التغييرات الحقيقية فقط
- مراقبة عدة مواقع
- تشغيل يدوي لكل عنصر للفحص السريع
- إعادة اختيار سريعة عند فشل الجمع
- موجه إعداد لـ Agent AI مثل Codex وClaude Code وOpenClaw وAntigravity والأدوات المشابهة
- حفظ عنوان الموقع وfavicon لتسهيل التمييز داخل النافذة

إذا لم تظهر التنبيهات:
- macOS: إعدادات النظام > الإشعارات > اسمح بإشعارات helper الخاص بالمتصفح
- Windows: الإعدادات > الإشعارات والإجراءات > اسمح بإشعارات المتصفح

إذا ظهرت تنبيهات غير متوقعة:
قد تكون من مواقع تم تسجيلها سابقًا. اكتب chrome://settings/content/notifications في شريط العنوان، ثم احظر ذلك الموقع أو أزله من قائمة السماح.

ملاحظات:
للمواقع التي تتطلب تسجيل دخول، حافظ على الجلسة مسجلة الدخول. الصفحات المحمية مثل Cloudflare قد تتطلب تحققًا يدويًا. الفواصل القصيرة جدًا قد تؤدي إلى حظر IP أو الحساب وفق سياسة الموقع.
