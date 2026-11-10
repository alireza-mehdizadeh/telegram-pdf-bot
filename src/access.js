import { DurableObject } from 'cloudflare:workers';

/**
 * Who may use the bot. A single instance (named "registry") serves the whole bot.
 *
 * Stored keys: `admin` → `{ id }`, and `user:<telegram id>` →
 * `{ id, name, username, status: 'pending' | 'approved' | 'denied', requestedAt }`.
 */
export class AccessList extends DurableObject {
  /**
   * @param {{id: number, name: string, username?: string}} user
   * @param {string} adminUsername the username that becomes admin
   * @returns {Promise<{role: 'admin' | 'approved' | 'pending' | 'denied' | 'new', bound?: boolean}>}
   */
  async check(user, adminUsername) {
    let admin = await this.ctx.storage.get('admin');
    let bound = false;
    // The username only matters the first time. After that the admin is tied to
    // that account's permanent numeric ID, so if the username is ever released
    // and taken by someone else, they do not become admin.
    const wanted = (adminUsername ?? '').replace(/^@/, '').toLowerCase();
    if (!admin && wanted && user.username?.toLowerCase() === wanted) {
      admin = { id: user.id };
      await this.ctx.storage.put('admin', admin);
      bound = true;
    }
    if (admin?.id === user.id) return { role: 'admin', bound };

    const key = `user:${user.id}`;
    const record = await this.ctx.storage.get(key);
    if (!record) return { role: 'new' };
    if (record.name !== user.name || record.username !== user.username) {
      await this.ctx.storage.put(key, { ...record, name: user.name, username: user.username });
    }
    return { role: record.status };
  }

  /** Puts a new user on the wait list. `created` is false if they were already known. */
  async request(user) {
    const key = `user:${user.id}`;
    const admin = await this.ctx.storage.get('admin');
    const existing = await this.ctx.storage.get(key);
    if (existing) return { created: false, status: existing.status, adminId: admin?.id };
    await this.ctx.storage.put(key, { ...user, status: 'pending', requestedAt: Date.now() });
    return { created: true, status: 'pending', adminId: admin?.id };
  }

  /** @returns the updated user, or null if the id is unknown */
  async setStatus(id, status) {
    const key = `user:${id}`;
    const record = await this.ctx.storage.get(key);
    if (!record) return null;
    const updated = { ...record, status };
    await this.ctx.storage.put(key, updated);
    return updated;
  }

  /** Users with the given status, oldest request first. */
  async list(status) {
    const all = [...(await this.ctx.storage.list({ prefix: 'user:' })).values()];
    return all.filter((u) => u.status === status).sort((a, b) => a.requestedAt - b.requestedAt);
  }

  async counts() {
    const counts = { pending: 0, approved: 0, denied: 0 };
    for (const user of (await this.ctx.storage.list({ prefix: 'user:' })).values()) {
      counts[user.status] += 1;
    }
    return counts;
  }
}
