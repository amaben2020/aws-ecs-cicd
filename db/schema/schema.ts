import {
  customType,
  integer,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

const bytea = customType<{ data: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  username: text('username').notNull(),
  email: text('email').unique().notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// Self-referencing many-to-many: a user follows other users
export const follows = pgTable(
  'follows',
  {
    followerId: integer('follower_id')
      .notNull()
      .references(() => users.id),
    followedId: integer('followed_id')
      .notNull()
      .references(() => users.id),
  },
  (t) => [primaryKey({ columns: [t.followerId, t.followedId] })],
);

export const posts = pgTable('posts', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id),
  content: text('content').notNull(),
  imageUrl: text('image_url'),
  createdAt: timestamp('created_at').defaultNow(),
});
export const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts),
  following: many(follows, { relationName: 'follower' }),
  followedBy: many(follows, { relationName: 'followed' }),
}));

export const followsRelations = relations(follows, ({ one }) => ({
  follower: one(users, {
    fields: [follows.followerId],
    references: [users.id],
    relationName: 'follower',
  }),
  followed: one(users, {
    fields: [follows.followedId],
    references: [users.id],
    relationName: 'followed',
  }),
}));

export const postsRelations = relations(posts, ({ one }) => ({
  author: one(users, {
    fields: [posts.userId],
    references: [users.id],
  }),
}));

export const documents = pgTable('documents', {
  id: serial('id').primaryKey(),
  fileName: text('file_name').notNull(),
  mimeType: text('mime_type').notNull(),
  size: integer('size').notNull(),
  sha256: text('sha256').notNull(),
  data: bytea('data').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});
