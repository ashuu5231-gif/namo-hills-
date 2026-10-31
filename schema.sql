CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY, type TEXT NOT NULL, name TEXT NOT NULL, phone TEXT NOT NULL, email TEXT,
  item TEXT, itemId TEXT, checkin TEXT, checkout TEXT, slotTime TEXT, guests TEXT,
  nights INTEGER DEFAULT 1, total INTEGER DEFAULT 0, status TEXT DEFAULT 'Confirmed',
  paymentMethod TEXT, createdAt TEXT
);
CREATE INDEX IF NOT EXISTS idx_bookings_phone ON bookings(phone);
CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL, whatsapp TEXT, email TEXT, city TEXT,
  address TEXT, idType TEXT, idNumber TEXT, purpose TEXT, guests TEXT, fromDate TEXT, toDate TEXT,
  time TEXT, rooms TEXT, notes TEXT, source TEXT, status TEXT DEFAULT 'New', createdAt TEXT
);
CREATE TABLE IF NOT EXISTS room_status (roomId TEXT PRIMARY KEY, status TEXT NOT NULL);
