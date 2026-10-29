import { DurableObject } from 'cloudflare:workers';
import {
  hashPassword,
  verifyPassword,
  parseDataUrl,
  randomToken,
  nowIso
} from './util.js';

const ADMIN_POINTS = 3;
const COUNTDOWN_SECONDS = 10;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'admin',
  created_at INTEGER
);
CREATE TABLE IF NOT EXISTS contestants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  stage_name TEXT,
  category TEXT,
  bio TEXT,
  photo_url TEXT,
  order_index INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  votes_count INTEGER DEFAULT 0,
  admin_votes_count INTEGER DEFAULT 0,
  points_total REAL DEFAULT 0,
  created_at INTEGER
);
CREATE TABLE IF NOT EXISTS model_gallery (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contestant_id INTEGER NOT NULL,
  image_url TEXT NOT NULL,
  order_index INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS voters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  telephone TEXT,
  session_token TEXT UNIQUE NOT NULL,
  ip_address TEXT,
  has_voted INTEGER DEFAULT 0,
  voted_at INTEGER,
  registered_at INTEGER
);
CREATE TABLE IF NOT EXISTS vote_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  voter_id INTEGER,
  contestant_id INTEGER,
  voter_type TEXT,
  points INTEGER DEFAULT 1,
  ip_address TEXT,
  user_agent TEXT,
  vote_hash TEXT,
  created_at INTEGER
);
CREATE TABLE IF NOT EXISTS event_state (
  id INTEGER PRIMARY KEY,
  status TEXT DEFAULT 'idle',
  countdown_active INTEGER DEFAULT 0,
  countdown_value INTEGER DEFAULT 0,
  countdown_ends_at INTEGER,
  winner_declared INTEGER DEFAULT 0,
  winner_id INTEGER,
  started_at INTEGER,
  ended_at INTEGER,
  updated_at INTEGER
);
CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  log_type TEXT,
  message TEXT,
  data TEXT,
  created_at INTEGER
);
CREATE TABLE IF NOT EXISTS media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mime TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at INTEGER
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_voters_token ON voters(session_token);
CREATE INDEX IF NOT EXISTS idx_voters_email ON voters(email);
CREATE INDEX IF NOT EXISTS idx_gallery_contestant ON model_gallery(contestant_id);
`;

export class Store extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
  }

  async _ready() {
    if (!this._initPromise) {
      this._initPromise = this._bootstrap();
    }
    await this._initPromise;
  }

  async _bootstrap() {
    this.sql.exec(SCHEMA);
    this.sql.exec("INSERT OR IGNORE INTO event_state (id, status, countdown_active, countdown_value, winner_declared) VALUES (1, 'idle', 0, 0, 0)");

    const username = this.env.ADMIN_USERNAME || 'admin';
    const password = this.env.ADMIN_PASSWORD || 'admin123';
    const admins = this.sql.exec('SELECT * FROM admins ORDER BY id LIMIT 1').toArray();

    if (!admins.length) {
      const hash = await hashPassword(password);
      this.sql.exec(
        'INSERT INTO admins (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)',
        username, hash, 'admin', Date.now()
      );
      return;
    }

    const admin = admins[0];
    const matches = await verifyPassword(password, admin.password_hash);
    if (!matches) {
      const hash = await hashPassword(password);
      this.sql.exec('UPDATE admins SET username = ?, password_hash = ? WHERE id = ?', username, hash, admin.id);
    }
  }

  _log(type, message, data) {
    this.sql.exec(
      'INSERT INTO logs (log_type, message, data, created_at) VALUES (?, ?, ?, ?)',
      type, message, data ? JSON.stringify(data) : null, Date.now()
    );
  }

  _stateRow() {
    return this.sql.exec('SELECT * FROM event_state WHERE id = 1').toArray()[0];
  }

  _tick() {
    const state = this._stateRow();
    if (!state || !state.countdown_ends_at) return state;

    const now = Date.now();
    let remaining = Math.ceil((state.countdown_ends_at - now) / 1000);
    if (remaining < 0) remaining = 0;

    if (remaining <= 0) {
      if (state.status === 'starting') {
        this.sql.exec(
          "UPDATE event_state SET status = 'voting', countdown_active = 0, countdown_value = 0, countdown_ends_at = NULL, updated_at = ? WHERE id = 1",
          now
        );
      } else if (state.status === 'runway_ended') {
        this.sql.exec(
          "UPDATE event_state SET status = 'ended', countdown_active = 0, countdown_value = 0, countdown_ends_at = NULL, ended_at = ?, updated_at = ? WHERE id = 1",
          now, now
        );
      } else {
        this.sql.exec('UPDATE event_state SET countdown_ends_at = NULL WHERE id = 1');
      }
    } else if (state.countdown_value !== remaining) {
      this.sql.exec('UPDATE event_state SET countdown_value = ?, updated_at = ? WHERE id = 1', remaining, now);
    }
    return this._stateRow();
  }

  _stateOut(state) {
    return {
      status: state.status || 'idle',
      countdown_active: !!state.countdown_active,
      countdown_value: state.countdown_value || 0,
      winner_declared: !!state.winner_declared,
      winner_id: state.winner_id || null
    };
  }

  _galleryFor(contestantId) {
    return this.sql.exec(
      'SELECT image_url FROM model_gallery WHERE contestant_id = ? ORDER BY order_index, id',
      contestantId
    ).toArray().map(r => r.image_url);
  }

  _contestantImages(row) {
    let gallery = this._galleryFor(row.id);
    if (!gallery.length && row.photo_url) gallery = [row.photo_url];
    else if (row.photo_url && !gallery.includes(row.photo_url)) gallery = [row.photo_url, ...gallery];
    return gallery;
  }

  _saveImage(value) {
    const parsed = parseDataUrl(value);
    if (!parsed) return value || '';
    this.sql.exec(
      'INSERT INTO media (mime, data, created_at) VALUES (?, ?, ?)',
      parsed.mime, parsed.data, Date.now()
    );
    const id = this.sql.exec('SELECT last_insert_rowid() AS id').toArray()[0].id;
    return `/api/media/${id}`;
  }

  _normalizeImages(data) {
    const raw = [];
    const photo = data.photo_url ? String(data.photo_url).trim() : '';
    if (photo) raw.push(photo);
    for (const image of data.gallery_images || []) {
      const value = String(image || '').trim();
      if (value && !raw.includes(value)) raw.push(value);
    }
    return this._saveGallery(raw);
  }

  _saveGallery(images) {
    const cleaned = [];
    for (const image of images || []) {
      if (!image || !String(image).trim()) continue;
      const saved = this._saveImage(String(image).trim());
      if (saved && !cleaned.includes(saved)) cleaned.push(saved);
    }
    return cleaned;
  }

  async ensureReady() {
    await this._ready();
    return { ok: true };
  }

  async getSecret() {
    await this._ready();
    const row = this.sql.exec("SELECT value FROM settings WHERE key = 'token_secret'").toArray()[0];
    if (row) return row.value;
    const value = randomToken(32);
    this.sql.exec("INSERT INTO settings (key, value) VALUES ('token_secret', ?)", value);
    return value;
  }

  async getState() {
    await this._ready();
    const state = this._tick();
    return this._stateOut(state);
  }

  async getGallery() {
    await this._ready();
    const contestants = this.sql.exec(
      'SELECT * FROM contestants WHERE is_active = 1 ORDER BY order_index, id'
    ).toArray();
    const items = [];
    for (const c of contestants) {
      for (const image of this._contestantImages(c)) {
        items.push({
          id: c.id,
          contestant_id: c.id,
          name: c.name,
          stage_name: c.stage_name,
          category: c.category,
          image_url: image
        });
      }
    }
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return { gallery: items };
  }

  async getPublicContestants() {
    await this._ready();
    const rows = this.sql.exec(
      'SELECT * FROM contestants WHERE is_active = 1 ORDER BY order_index, id'
    ).toArray();
    return rows.map(c => ({
      id: c.id,
      name: c.name,
      stage_name: c.stage_name,
      category: c.category,
      bio: c.bio,
      photo_url: c.photo_url,
      gallery: this._contestantImages(c),
      is_active: !!c.is_active,
      votes_count: c.votes_count,
      admin_votes_count: c.admin_votes_count,
      points_total: c.points_total,
      order_index: c.order_index
    }));
  }

  async getScoreboard() {
    await this._ready();
    const state = this._tick();
    const rows = this.sql.exec(
      'SELECT * FROM contestants WHERE is_active = 1 ORDER BY points_total DESC, order_index, id'
    ).toArray();

    const totalPoints = rows.reduce((sum, c) => sum + (c.points_total || 0), 0);
    const contestants = rows.map(c => ({
      id: c.id,
      name: c.name,
      stage_name: c.stage_name,
      category: c.category,
      photo_url: c.photo_url,
      gallery: this._contestantImages(c),
      votes_count: c.votes_count,
      admin_votes_count: c.admin_votes_count,
      points_total: c.points_total,
      percentage: totalPoints > 0 ? Math.round((c.points_total / totalPoints) * 1000) / 10 : 0
    }));

    let winner = null;
    if (state.winner_id) {
      const w = this.sql.exec('SELECT * FROM contestants WHERE id = ?', state.winner_id).toArray()[0];
      if (w) {
        winner = {
          id: w.id,
          name: w.name,
          stage_name: w.stage_name,
          photo_url: w.photo_url,
          points_total: w.points_total,
          votes_count: w.votes_count,
          gallery: this._contestantImages(w),
          percentage: totalPoints > 0 ? Math.round((w.points_total / totalPoints) * 1000) / 10 : 0
        };
      }
    }

    const stats = this._stats();
    return {
      contestants,
      state: this._stateOut(state),
      winner,
      stats: { ...stats, total_points: totalPoints }
    };
  }

  _stats() {
    const totalVoters = this.sql.exec('SELECT COUNT(*) AS n FROM voters').toArray()[0].n;
    const votedCount = this.sql.exec('SELECT COUNT(*) AS n FROM voters WHERE has_voted = 1').toArray()[0].n;
    const votesCast = this.sql.exec('SELECT COALESCE(SUM(votes_count), 0) AS n FROM contestants WHERE is_active = 1').toArray()[0].n;
    const ledger = this.sql.exec('SELECT COUNT(*) AS n FROM vote_ledger').toArray()[0].n;
    return {
      total_voters: totalVoters,
      voted_count: votedCount,
      votes_cast: votesCast,
      total_votes: ledger,
      audience_count: totalVoters
    };
  }

  async registerVoter({ name, email, telephone, ip }) {
    await this._ready();
    const existing = this.sql.exec('SELECT * FROM voters WHERE email = ? LIMIT 1', email).toArray()[0];
    if (existing) {
      return {
        message: 'Already registered',
        session_token: existing.session_token,
        voter: { id: existing.id, name: existing.name, email: existing.email, has_voted: !!existing.has_voted }
      };
    }

    const token = randomToken(32);
    this.sql.exec(
      'INSERT INTO voters (name, email, telephone, session_token, ip_address, has_voted, registered_at) VALUES (?, ?, ?, ?, ?, 0, ?)',
      name, email, telephone, token, ip || null, Date.now()
    );
    const id = this.sql.exec('SELECT last_insert_rowid() AS id').toArray()[0].id;
    this._log('registration', `Voter registered: ${name} (${email})`, { name, email, telephone, ip });
    return {
      message: 'Registration successful',
      session_token: token,
      voter: { id, name, email, has_voted: false }
    };
  }

  async castVote({ token, contestantId, ip, userAgent }) {
    await this._ready();
    const voter = this.sql.exec('SELECT * FROM voters WHERE session_token = ? LIMIT 1', token).toArray()[0];
    if (!voter) return { error: 'Invalid session', status: 401 };

    const state = this._tick();
    if (!state || state.status !== 'voting') return { error: 'Voting is not open', status: 403 };
    if (voter.has_voted) return { error: 'You have already voted', status: 400 };

    const contestant = this.sql.exec(
      'SELECT * FROM contestants WHERE id = ? AND is_active = 1 LIMIT 1', contestantId
    ).toArray()[0];
    if (!contestant) return { error: 'Contestant not found', status: 404 };

    const now = Date.now();
    this.sql.exec(
      'INSERT INTO vote_ledger (voter_id, contestant_id, voter_type, points, ip_address, user_agent, vote_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      voter.id, contestant.id, 'audience', 1, ip || null, userAgent || null, randomToken(24), now
    );
    this.sql.exec(
      'UPDATE contestants SET votes_count = votes_count + 1, points_total = points_total + 1 WHERE id = ?',
      contestant.id
    );
    this.sql.exec('UPDATE voters SET has_voted = 1, voted_at = ? WHERE id = ?', now, voter.id);
    this._log('vote', `Vote cast for ${contestant.name}`, { voter_id: voter.id, contestant_id: contestant.id, points: 1 });
    return { message: 'Vote cast successfully', contestant: contestant.name };
  }

  async getVoterStatus(token) {
    await this._ready();
    if (!token) return null;
    const voter = this.sql.exec('SELECT * FROM voters WHERE session_token = ? LIMIT 1', token).toArray()[0];
    if (!voter) return null;
    return { id: voter.id, name: voter.name, email: voter.email, has_voted: !!voter.has_voted };
  }

  async adminLogin(username, password) {
    await this._ready();
    const admin = this.sql.exec('SELECT * FROM admins WHERE username = ? LIMIT 1', username).toArray()[0];
    if (!admin) return null;
    const ok = await verifyPassword(password, admin.password_hash);
    if (!ok) return null;
    return { username: admin.username, role: admin.role || 'admin' };
  }

  async listContestants() {
    await this._ready();
    return this.sql.exec('SELECT * FROM contestants ORDER BY order_index, id').toArray().map(c => ({
      id: c.id,
      name: c.name,
      stage_name: c.stage_name,
      category: c.category,
      bio: c.bio,
      photo_url: c.photo_url,
      gallery: this._galleryFor(c.id).map((url, index) => ({ id: index + 1, image_url: url, order_index: index })),
      gallery_images: this._contestantImages(c),
      order_index: c.order_index,
      is_active: !!c.is_active,
      votes_count: c.votes_count,
      admin_votes_count: c.admin_votes_count,
      points_total: c.points_total,
      created_at: nowIso(c.created_at)
    }));
  }

  async createContestant(data) {
    await this._ready();
    const images = this._normalizeImages(data);

    this.sql.exec(
      'INSERT INTO contestants (name, stage_name, category, bio, photo_url, order_index, is_active, votes_count, admin_votes_count, points_total, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, 0, 0, 0, ?)',
      data.name || '', data.stage_name || '', data.category || '', data.bio || '',
      images[0] || '', Number(data.order_index) || 0, Date.now()
    );
    const id = this.sql.exec('SELECT last_insert_rowid() AS id').toArray()[0].id;
    images.forEach((url, index) => {
      this.sql.exec(
        'INSERT INTO model_gallery (contestant_id, image_url, order_index) VALUES (?, ?, ?)',
        id, url, index
      );
    });
    this._log('admin_action', `Model added: ${data.name || ''}`, { action: 'create_contestant', id });
    return { id, name: data.name, gallery: images };
  }

  async updateContestant(id, data) {
    await this._ready();
    const existing = this.sql.exec('SELECT * FROM contestants WHERE id = ?', id).toArray()[0];
    if (!existing) return null;

    let images = null;
    if (data.gallery_images !== undefined) {
      images = this._normalizeImages(data);
    } else if (data.photo_url !== undefined) {
      const photo = this._saveImage(data.photo_url || '');
      images = photo ? [photo] : [];
    }

    this.sql.exec(
      'UPDATE contestants SET name = ?, stage_name = ?, category = ?, bio = ?, order_index = ?, photo_url = ? WHERE id = ?',
      data.name ?? existing.name,
      data.stage_name ?? existing.stage_name,
      data.category ?? existing.category,
      data.bio ?? existing.bio,
      Number.isFinite(Number(data.order_index)) ? Number(data.order_index) : existing.order_index,
      images ? (images[0] || '') : existing.photo_url,
      id
    );

    if (images) {
      this.sql.exec('DELETE FROM model_gallery WHERE contestant_id = ?', id);
      images.forEach((url, index) => {
        this.sql.exec(
          'INSERT INTO model_gallery (contestant_id, image_url, order_index) VALUES (?, ?, ?)',
          id, url, index
        );
      });
    }

    this._log('admin_action', `Model updated: ${data.name || existing.name}`, { action: 'update_contestant', id });
    return { id };
  }

  async deleteContestant(id) {
    await this._ready();
    const existing = this.sql.exec('SELECT * FROM contestants WHERE id = ?', id).toArray()[0];
    if (!existing) return false;
    this.sql.exec('DELETE FROM model_gallery WHERE contestant_id = ?', id);
    this.sql.exec('DELETE FROM vote_ledger WHERE contestant_id = ?', id);
    this.sql.exec('DELETE FROM contestants WHERE id = ?', id);
    this.sql.exec('UPDATE event_state SET winner_id = NULL, winner_declared = 0 WHERE winner_id = ?', id);
    this._log('admin_action', `Model removed: ${existing.name}`, { action: 'delete_contestant', id });
    return true;
  }

  async adminVote(contestantId, ip, userAgent) {
    await this._ready();
    const contestant = this.sql.exec(
      'SELECT * FROM contestants WHERE id = ? AND is_active = 1 LIMIT 1', contestantId
    ).toArray()[0];
    if (!contestant) return null;

    const now = Date.now();
    for (let i = 0; i < ADMIN_POINTS; i++) {
      this.sql.exec(
        'INSERT INTO vote_ledger (voter_id, contestant_id, voter_type, points, ip_address, user_agent, vote_hash, created_at) VALUES (NULL, ?, ?, 1, ?, ?, ?, ?)',
        contestant.id, 'audience', ip || null, userAgent || null, randomToken(24), now
      );
    }
    this.sql.exec(
      'UPDATE contestants SET votes_count = votes_count + ?, admin_votes_count = admin_votes_count + 1, points_total = points_total + ? WHERE id = ?',
      ADMIN_POINTS, ADMIN_POINTS, contestant.id
    );
    this._log('vote', `Admin vote cast (${ADMIN_POINTS} pts, counted as ${ADMIN_POINTS} audience votes) for ${contestant.name}`, {
      contestant_id: contestant.id, points: ADMIN_POINTS, voter_type: 'audience', admin_action: true
    });
    return {
      message: `Admin vote cast (+${ADMIN_POINTS} pts)`,
      contestant: contestant.name,
      points: ADMIN_POINTS,
      votes: (contestant.admin_votes_count || 0) + 1
    };
  }

  async controlEvent(action) {
    await this._ready();
    const now = Date.now();
    const current = this._stateRow();

    if (action === 'start') {
      this.sql.exec(
        "UPDATE event_state SET status = 'starting', countdown_active = 1, countdown_value = ?, countdown_ends_at = ?, started_at = ?, winner_declared = 0, winner_id = NULL, updated_at = ? WHERE id = 1",
        COUNTDOWN_SECONDS, now + COUNTDOWN_SECONDS * 1000, now, now
      );
      this._log('admin_action', 'Session started - countdown initiated', { action });
    } else if (action === 'begin_voting') {
      this.sql.exec(
        "UPDATE event_state SET status = 'voting', countdown_active = 0, countdown_value = 0, countdown_ends_at = NULL, updated_at = ? WHERE id = 1",
        now
      );
      this._log('admin_action', 'Voting opened manually', { action });
    } else if (action === 'end') {
      this.sql.exec(
        "UPDATE event_state SET status = 'ended', countdown_active = 0, countdown_ends_at = NULL, ended_at = ?, updated_at = ? WHERE id = 1",
        now, now
      );
    } else if (action === 'runway_ended') {
      this.sql.exec(
        "UPDATE event_state SET status = 'runway_ended', countdown_active = 1, countdown_value = ?, countdown_ends_at = ?, updated_at = ? WHERE id = 1",
        COUNTDOWN_SECONDS, now + COUNTDOWN_SECONDS * 1000, now
      );
      this._log('admin_action', 'Runway ended - winner countdown initiated', { action });
    } else if (action === 'declare_winner') {
      const winner = this.sql.exec(
        'SELECT * FROM contestants WHERE is_active = 1 ORDER BY points_total DESC, votes_count DESC, id LIMIT 1'
      ).toArray()[0];
      if (winner) {
        this.sql.exec(
          'UPDATE event_state SET winner_id = ?, winner_declared = 1, updated_at = ? WHERE id = 1',
          winner.id, now
        );
        this._log('admin_action', `Winner declared: ${winner.name}`, { action, winner_id: winner.id, winner_name: winner.name });
      }
    } else if (action === 'reset') {
      this.sql.exec(
        "UPDATE event_state SET status = 'idle', countdown_active = 0, countdown_value = 0, countdown_ends_at = NULL, winner_declared = 0, winner_id = NULL, started_at = NULL, ended_at = NULL, updated_at = ? WHERE id = 1",
        now
      );
      this.sql.exec('UPDATE contestants SET votes_count = 0, admin_votes_count = 0, points_total = 0');
      this.sql.exec('UPDATE voters SET has_voted = 0, voted_at = NULL');
      this.sql.exec('DELETE FROM vote_ledger');
      this._log('admin_action', 'Tally reset', { action });
    }

    return this._stateOut(this._stateRow());
  }

  async getStats() {
    await this._ready();
    const state = this._tick();
    const contestants = this.sql.exec(
      'SELECT * FROM contestants WHERE is_active = 1 ORDER BY points_total DESC, id'
    ).toArray();
    return {
      ...this._stats(),
      contestants: contestants.map(c => ({
        id: c.id,
        name: c.name,
        votes_count: c.votes_count,
        admin_votes_count: c.admin_votes_count,
        points_total: c.points_total,
        photo_url: c.photo_url,
        stage_name: c.stage_name
      })),
      state: this._stateOut(state)
    };
  }

  async getLogs(limit = 100) {
    await this._ready();
    return this.sql.exec(
      'SELECT * FROM logs ORDER BY created_at DESC, id DESC LIMIT ?', limit
    ).toArray().map(l => ({
      id: l.id,
      log_type: l.log_type,
      message: l.message,
      data: l.data,
      created_at: nowIso(l.created_at)
    }));
  }

  async getVoters() {
    await this._ready();
    return this.sql.exec('SELECT * FROM voters ORDER BY registered_at DESC, id DESC').toArray().map(v => ({
      id: v.id,
      name: v.name,
      email: v.email,
      telephone: v.telephone,
      has_voted: !!v.has_voted,
      registered_at: nowIso(v.registered_at),
      ip_address: v.ip_address
    }));
  }

  async decrementCountdown() {
    await this._ready();
    const state = this._tick();
    return this._stateOut(state);
  }

  async getMedia(id) {
    await this._ready();
    const row = this.sql.exec('SELECT mime, data FROM media WHERE id = ?', id).toArray()[0];
    if (!row) return null;
    return { mime: row.mime, data: row.data };
  }
}
