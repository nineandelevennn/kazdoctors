// ============================================================================
// Файл: /session-guard.js
// Единая защита всех тренажеров и конспектов kazdoctors.com
// (Аккаунт + Срок подписки + 1 устройство + Тарифы: standard, pro, premium, vip)
// ============================================================================

(function () {
    const SUPABASE_URL = "https://jjfkiqmqoscnodcvdktf.supabase.co";
    const SUPABASE_KEY = "sb_publishable_2Ygo9OvIMmtCfqt1C0glow_uDGaQ7nZ";

    // Уровни тарифов:
    // 1 = standard (только тренажеры)
    // 2 = pro (тренажеры + конспекты)
    // 3 = premium (тренажеры + конспекты + видеоуроки)
    // 4 = vip (все включено + личное ведение)
    const TIER_LEVELS = {
        standard: 1,
        pro: 2,
        premium: 3,
        vip: 4
    };

    // 1. Мгновенно скрываем содержимое страницы до окончания проверки,
    // чтобы пользователь без подписки не видел материалы даже доли секунды
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

    // Получаем или создаем клиент Supabase
    function getClient() {
        if (typeof supabaseClient !== 'undefined' && supabaseClient) return supabaseClient;
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

            // ШАГ 2: Ищем профиль пользователя в таблице profiles (включая колонку tier)
            let { data: profile, error: profileError } = await client
                .from('profiles')
                .select('id, email, current_device_id, subscription_expires_at, tier')
                .eq('id', user.id)
                .maybeSingle();

            if (!profile && userEmail) {
                const resByEmail = await client
                    .from('profiles')
                    .select('id, email, current_device_id, subscription_expires_at, tier')
                    .ilike('email', userEmail)
                    .maybeSingle();
                profile = resByEmail.data;
                profileError = resByEmail.error;
            }

            // ШАГ 3: Если человек зарегистрировался сам и его еще нет в таблице profiles —
            // создаем ему запись с ИСТЕКШЕЙ датой (1970 год) и базовым тарифом 'standard'
            if (!profile) {
                await client.from('profiles').insert({
                    id: user.id,
                    email: userEmail,
                    current_device_id: localDeviceId,
                    subscription_expires_at: '1970-01-01T00:00:00Z',
                    tier: 'standard'
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

            // ШАГ 6: Проверка уровня тарифа (Стандарт / Про / Премиум / ВИП)
            const userTier = (profile.tier || 'standard').toLowerCase().trim();
            const userLevel = TIER_LEVELS[userTier] || 1;
            const currentPath = window.location.pathname.toLowerCase();

            // Если это страница конспекта/теории (/grammar/lesson1, lesson2 и т.д.),
            // требуем тариф не ниже 'pro' (уровень 2 и выше)
            const isTheoryPage = currentPath.includes('/grammar/lesson') || currentPath.includes('theory');

            if (isTheoryPage && userLevel < TIER_LEVELS.pro) {
                blockAccess(
                    "У вас активен тариф «Стандарт» (доступ только к тренажерам). Конспекты и теория доступны на тарифах «Про», «Премиум» и «ВИП»!",
                    "/tarifs/"
                );
                return;
            }

            // Все проверки успешно пройдены — показываем страницу!
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
