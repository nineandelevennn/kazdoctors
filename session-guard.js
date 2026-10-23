// Файл: session-guard.js

function getDeviceUUID() {
    let deviceId = localStorage.getItem('app_device_id');
    if (!deviceId) {
        deviceId = 'dev_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now().toString(36);
        localStorage.setItem('app_device_id', deviceId);
    }
    return deviceId;
}

async function verifyUserAccess() {
    // Ждем, пока Supabase клиент инициализируется на странице
    if (typeof supabaseClient === 'undefined') return;

    const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
    if (sessionError || !session) {
        // Если пользователь не авторизован вообще, редиректим на логин
        window.location.href = '/login.html';
        return;
    }

    const user = session.user;
    const localDeviceId = getDeviceUUID();

    // Ищем профиль пользователя в таблице profiles по его уникальному ID
    const { data: profile, error } = await supabaseClient
        .from('profiles')
        .select('id, current_device_id, subscription_expires_at')
        .eq('id', user.id)
        .single();

    // Если профиля по какой-то причине нет в таблице
    if (error && error.code === 'PGRST116') {
        alert("У вашего аккаунта не найден профиль подписки. Обратитесь к администратору.");
        await supabaseClient.auth.signOut();
        window.location.href = '/tarifs/';
        return;
    }

    if (!profile) {
        window.location.href = '/tarifs/';
        return;
    }

    // 1. ПРОВЕРКА СРОКА ПОДПИСКИ
    // Если дата пустая (null) или меньше текущего момента — доступа нет!
    if (!profile.subscription_expires_at) {
        alert("У вас нет активной подписки. Пожалуйста, выберите тариф для доступа к материалам.");
        window.location.href = '/tarifs/';
        return;
    }

    const expiresAt = new Date(profile.subscription_expires_at);
    if (new Date() > expiresAt) {
        alert("Срок действия вашей подписки истек! Пожалуйста, обратитесь к администратору для продления доступа.");
        await supabaseClient.auth.signOut();
        window.location.href = '/tarifs/';
        return;
    }

    // 2. ПРОВЕРКА ОДНОГО УСТРОЙСТВА
    if (!profile.current_device_id) {
        await supabaseClient
            .from('profiles')
            .update({ current_device_id: localDeviceId })
            .eq('id', user.id);
    } else if (profile.current_device_id !== localDeviceId) {
        alert("В ваш аккаунт выполнен вход с другого устройства. Одновременный доступ запрещен.");
        await supabaseClient.auth.signOut();
        window.location.href = '/login.html';
        return;
    }
}

// Запускаем при открытии страницы и каждые 30 секунд в фоне
document.addEventListener("DOMContentLoaded", () => {
    verifyUserAccess();
    setInterval(verifyUserAccess, 30000);
});
