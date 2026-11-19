import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

const testUrl = process.env.TEST_DATABASE_URL;
test("PostgreSQL room admission, isolation, and action idempotency", { skip: !testUrl && "Set TEST_DATABASE_URL to a migrated test database." }, async () => {
  process.env.DATABASE_URL = testUrl;
  const { db } = await import("../db/index");
  const { users, debugRooms, activities, roomRequests } = await import("../db/schema");
  const { eq, inArray } = await import("drizzle-orm");
  const { isMember, admitParticipant, createDebugRoom, requestAdmission, hasRoomAccount } = await import("../lib/rooms");
  const { reserveActivity } = await import("../lib/room-activities");
  const accounts = [randomUUID(), randomUUID(), randomUUID()];
  const id = randomUUID();
  try {
    const staleUser = randomUUID();
    assert.equal(await hasRoomAccount(staleUser), false);
    await assert.rejects(createDebugRoom(staleUser), /session has expired/);
    await assert.rejects(requestAdmission(randomUUID(), staleUser), /session has expired/);
    await db.insert(users).values(accounts.map((id) => ({ id, email: id + "@test.invalid" })));
    assert.equal(await hasRoomAccount(accounts[0]), true);
    await db.insert(debugRooms).values({ id, inviteCode: randomUUID(), ownerId: accounts[0] });
    await db.insert(roomRequests).values(accounts.slice(1).map((userId) => ({ roomId: id, userId })));
    const admitted = await Promise.all(accounts.slice(1).map((user) => admitParticipant(id, accounts[0], user)));
    assert.equal(admitted.filter(Boolean).length, 1, "atomic admission grants only the second slot");
    const [room] = await db.select().from(debugRooms).where(eq(debugRooms.id, id));
    const outsider = accounts.find((account) => account !== room.ownerId && account !== room.participantId)!;
    assert.equal(isMember(room, room.ownerId), true);
    assert.equal(isMember(room, room.participantId!), true);
    assert.equal(isMember(room, outsider), false);
    assert.equal(isMember({ ...room, status: "closed" }, room.ownerId), false);

    const input = { code: "int main() { return 0; }", testCases: [] };
    await assert.rejects(reserveActivity(id, outsider, randomUUID(), "execution", input, 0), /access/);
    const operation = randomUUID();
    const reservations = await Promise.all([
      reserveActivity(id, room.ownerId, operation, "execution", input, 0),
      reserveActivity(id, room.participantId!, operation, "execution", input, 0),
    ]);
    assert.equal(reservations.filter((reservation) => reservation.created).length, 1);
    assert.equal(reservations[0].activity.id, reservations[1].activity.id);
    await assert.rejects(reserveActivity(id, room.ownerId, randomUUID(), "execution", input, 0), /in progress/);
    const otherRoom = randomUUID();
    await db.insert(debugRooms).values({ id: otherRoom, inviteCode: randomUUID(), ownerId: room.ownerId });
    await assert.rejects(reserveActivity(otherRoom, room.ownerId, operation, "analysis", input, 0), /already used/);
    const records = await db.select().from(activities).where(eq(activities.roomId, id));
    assert.equal(records.length, 1);
  } finally {
    await db.delete(users).where(inArray(users.id, accounts));
    await db.$client.end();
  }
});
