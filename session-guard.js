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
    if (typeof supabaseClient === 'undefined') return;

    const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
    if (sessionError || !session) return; // Если не вошел, страницу блокирует ваш стандартный код

    const user = session.user;
    const userEmail = user.email.toLowerCase();
    const localDeviceId = getDeviceUUID();

    // Ищем профиль пользователя по его email
    const { data: profile, error } = await supabaseClient
        .from('profiles')
        .select('id, current_device_id, subscription_expires_at')
        .eq('email', userEmail)
        .single();

    // Если записи еще нет в таблице — создаем со сроком 1 месяц по умолчанию
    if (error && error.code === 'PGRST116') {
        const nextMonth = new Date();
        nextMonth.setMonth(nextMonth.getMonth() + 1);

        await supabaseClient.from('profiles').insert({
            id: user.id,
            email: userEmail,
            current_device_id: localDeviceId,
            subscription_expires_at: nextMonth.toISOString()
        });
        return;
    }

    if (!profile) return;

    // 1. ПРОВЕРКА СРОКА ПОДПИСКИ
    if (profile.subscription_expires_at) {
        const expiresAt = new Date(profile.subscription_expires_at);
        if (new Date() > expiresAt) {
            alert("Срок вашей подписки истек! Пожалуйста, обратитесь к администратору для продления доступа.");
            await supabaseClient.auth.signOut();
            window.location.href = '/login.html';
            return;
        }
    }

    // 2. ПРОВЕРКА ОДНОГО УСТРОЙСТВА
    if (!profile.current_device_id) {
        await supabaseClient
            .from('profiles')
            .update({ id: user.id, current_device_id: localDeviceId })
            .eq('email', userEmail);
    } else if (profile.current_device_id !== localDeviceId) {
        alert("В ваш аккаунт выполнен вход с другого устройства. Одновременный доступ запрещен.");
        await supabaseClient.auth.signOut();
        window.location.href = '/login.html';
        return;
    }
}

// Запускаем при открытии страницы и каждые 30 секунд
document.addEventListener("DOMContentLoaded", () => {
    verifyUserAccess();
    setInterval(verifyUserAccess, 30000);
});
