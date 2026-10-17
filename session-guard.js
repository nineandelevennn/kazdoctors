// Файл: session-guard.js

// 1. Получение или генерация уникального ID браузера/устройства
function getDeviceUUID() {
    let deviceId = localStorage.getItem('app_device_id');
    if (!deviceId) {
        deviceId = 'dev_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now().toString(36);
        localStorage.setItem('app_device_id', deviceId);
    }
    return deviceId;
}

// 2. Функция для записи устройства при логине (вызывайте её в login.html после успешного signInWithPassword)
window.registerNewDeviceSession = async function() {
    if (typeof supabaseClient === 'undefined') return;
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return;

    const deviceId = getDeviceUUID();
    await supabaseClient
        .from('profiles')
        .upsert({ 
            id: session.user.id, 
            email: session.user.email,
            current_device_id: deviceId 
        }, { onConflict: 'id' });
};

// 3. Главная проверка: 1 устройство + проверка месячного доступа
async function verifyUserAccess() {
    if (typeof supabaseClient === 'undefined') return;

    const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
    if (sessionError || !session) return; // Если пользователь не залогинен, ничего не делаем

    const user = session.user;
    const localDeviceId = getDeviceUUID();

    // Получаем данные профиля из базы
    const { data: profile, error } = await supabaseClient
        .from('profiles')
        .select('current_device_id, subscription_expires_at')
        .eq('id', user.id)
        .single();

    // Если записи в profiles еще нет — создаем её (даем 1 месяц доступа по умолчанию)
    if (error && error.code === 'PGRST116') {
        const nextMonth = new Date();
        nextMonth.setMonth(nextMonth.getMonth() + 1);

        await supabaseClient.from('profiles').insert({
            id: user.id,
            email: user.email,
            current_device_id: localDeviceId,
            subscription_expires_at: nextMonth.toISOString()
        });
        return;
    }

    if (!profile) return;

    // ПРОВЕРКА 1: Доступен ли еще вход по времени (месячный лимит доступа)
    if (profile.subscription_expires_at) {
        const expiresAt = new Date(profile.subscription_expires_at);
        const now = new Date();

        if (now > expiresAt) {
            alert("Ваш месячный доступ истек! Пожалуйста, продлите подписку для продолжения занятий.");
            await supabaseClient.auth.signOut();
            window.location.href = '/login.html';
            return;
        }
    }

    // ПРОВЕРКА 2: Не зашли ли в аккаунт с другого устройства одновременно
    if (!profile.current_device_id) {
        // Если поле пустое, привязываем текущее устройство
        await supabaseClient
            .from('profiles')
            .update({ current_device_id: localDeviceId })
            .eq('id', user.id);
    } else if (profile.current_device_id !== localDeviceId) {
        alert("В ваш аккаунт выполнен вход с другого устройства. Одновременное использование с нескольких устройств запрещено.");
        await supabaseClient.auth.signOut();
        window.location.href = '/login.html';
        return;
    }
}

// Запускаем проверку при открытии страницы и каждые 30 секунд в фоне
document.addEventListener("DOMContentLoaded", () => {
    verifyUserAccess();
    setInterval(verifyUserAccess, 30000);
});
