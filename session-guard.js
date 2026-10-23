// ============================================================================
// Файл: /session-guard.js
// Единая защита всех тренажеров kazdoctors.com (Аккаунт + Подписка + 1 устройство)
// ============================================================================

(function () {
    const SUPABASE_URL = "https://jjfkiqmqoscnodcvdktf.supabase.co";
    const SUPABASE_KEY = "sb_publishable_2Ygo9OvIMmtCfqt1C0glow_uDGaQ7nZ";

    // 1. Мгновенно скрываем содержимое тренажера до окончания проверки,
    // чтобы пользователь без подписки не видел вопросы даже доли секунды
    const hideStyle = document.createElement('style');
    hideStyle.id = 'session-guard-cloak';
    hideStyle.innerHTML = 'body { opacity: 0 !important; pointer-events: none !important; transition: opacity 0.2s ease; }';
    document.head.appendChild(hideStyle);

    function unlockPage() {
        const cloak = document.getElementById('session-guard-cloak');
        if (cloak) cloak.remove();
    }

    function blockAccess(message, redirectUrl) {
        alert(message);
        window.location.replace(redirectUrl);
    }

    // Генерация уникального ID устройства для защиты от шеринга аккаунта
    function getDeviceUUID() {
        let deviceId = localStorage.getItem('app_device_id');
        if (!deviceId) {
            deviceId = 'dev_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now().toString(36);
            localStorage.setItem('app_device_id', deviceId);
        }
        return deviceId;
    }

    // Получаем или создаем клиент Supabase (работает даже если в тренажере переменная названа иначе)
    function getClient() {
        if (typeof supabaseClient !== 'undefined') return supabaseClient;
        if (window.supabase && typeof window.supabase.createClient === 'function') {
            return window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        }
        return null;
    }

    async function verifyUserAccess() {
        const client = getClient();
        if (!client) {
            // Если библиотека Supabase еще подгружается, пробуем снова через 100 мс
            setTimeout(verifyUserAccess, 100);
            return;
        }

        try {
            // ШАГ 1: Проверяем, вошел ли человек в аккаунт Supabase Auth
            const { data: sessionData, error: sessionError } = await client.auth.getSession();
            if (sessionError || !sessionData || !sessionData.session) {
                window.location.replace('/login.html');
                return;
            }

            const user = sessionData.session.user;
            const userEmail = (user.email || '').toLowerCase().trim();
            const localDeviceId = getDeviceUUID();

            // ШАГ 2: Ищем профиль пользователя в таблице profiles (сначала по ID, затем по Email)
            let { data: profile, error: profileError } = await client
                .from('profiles')
                .select('id, email, current_device_id, subscription_expires_at')
                .eq('id', user.id)
                .maybeSingle();

            if (!profile && userEmail) {
                const resByEmail = await client
                    .from('profiles')
                    .select('id, email, current_device_id, subscription_expires_at')
                    .ilike('email', userEmail)
                    .maybeSingle();
                profile = resByEmail.data;
                profileError = resByEmail.error;
            }

            // ШАГ 3: Если человек зарегистрировался сам и его еще нет в таблице profiles —
            // создаем ему запись с ИСТЕКШЕЙ датой (1970 год) и НЕ пускаем в тренажер!
            if (!profile) {
                await client.from('profiles').insert({
                    id: user.id,
                    email: userEmail,
                    current_device_id: localDeviceId,
                    subscription_expires_at: '1970-01-01T00:00:00Z' // Подписка НЕ активна по умолчанию
                });

                blockAccess(
                    "Ваш аккаунт зарегистрирован, но подписка еще не активирована! Пожалуйста, выберите тариф или напишите администратору для открытия доступа.",
                    "/tarifs/"
                );
                return;
            }

            // ШАГ 4: Проверяем наличие и срок действия подписки
            if (!profile.subscription_expires_at) {
                blockAccess(
                    "У вашего аккаунта нет активной подписки. Перенаправляем на страницу тарифов.",
                    "/tarifs/"
                );
                return;
            }

            const expiresAt = new Date(profile.subscription_expires_at);
            const now = new Date();

            if (isNaN(expiresAt.getTime()) || now > expiresAt) {
                blockAccess(
                    "Срок вашей подписки не активен или истек! Обратитесь к администратору для продления доступа.",
                    "/tarifs/"
                );
                return;
            }

            // ШАГ 5: Проверка привязки к одному устройству
            if (!profile.current_device_id) {
                await client
                    .from('profiles')
                    .update({ id: user.id, current_device_id: localDeviceId })
                    .eq('email', profile.email || userEmail);
            } else if (profile.current_device_id !== localDeviceId) {
                await client.auth.signOut();
                blockAccess(
                    "В ваш аккаунт выполнен вход с другого устройства. Одновременный доступ с нескольких устройств запрещен.",
                    "/login.html"
                );
                return;
            }

            // Все проверки успешно пройдены — показываем страницу тренажера!
            unlockPage();

        } catch (err) {
            console.error("Session guard error:", err);
            blockAccess("Ошибка проверки доступа. Пожалуйста, войдите снова.", "/login.html");
        }
    }

    // Запускаем проверку сразу при загрузке и повторяем каждые 30 секунд
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", verifyUserAccess);
    } else {
        verifyUserAccess();
    }
    setInterval(verifyUserAccess, 30000);
})();
