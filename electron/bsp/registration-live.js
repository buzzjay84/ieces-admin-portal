const { createClient } = require('@supabase/supabase-js');

function watchRegistrations(cfg, token, notify) {
  let stopped = false;
  const client = createClient(cfg.url, cfg.key, {
    accessToken: token,
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const channel = client.channel('desktop-registrations')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'bsp_registrations' }, () => { if (!stopped) notify({ changed: true }); })
    .subscribe(status => {
      if (stopped) return;
      if (status === 'SUBSCRIBED') notify({ changed: true });
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        notify({ error: 'Live updates unavailable. Enable Realtime for bsp_registrations in Supabase; use Refresh to check manually.' });
      }
    });
  // Refresh authentication without fetching or redrawing the registration list.
  const authTimer = setInterval(() => {
    token().then(value => { if (!stopped) return client.realtime.setAuth(value); })
      .catch(() => { if (!stopped) notify({ error: 'Live updates require signing in again.' }); });
  }, 60000);
  return () => {
    stopped = true;
    clearInterval(authTimer);
    void client.removeChannel(channel);
  };
}

module.exports = { watchRegistrations };
