import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { users } from "@/db/schema";
import { readJson, record, RequestError } from "@/lib/request-body";

export async function POST(req: Request) {
  try {
    const { email, password } = record(await readJson(req, 8192));
    if (typeof email !== "string" || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        typeof password !== "string" || password.length < 6 || Buffer.byteLength(password) > 72) {
      throw new RequestError("Enter a valid email and a password of at least 6 characters and at most 72 UTF-8 bytes.");
    }

    const [user] = await db.insert(users).values({
      email, password: await bcrypt.hash(password, 10), name: email.split("@")[0],
    }).onConflictDoNothing({ target: users.email }).returning({ id: users.id });

    if (!user) return NextResponse.json({ error: "Email is already registered." }, { status: 400 });
    return NextResponse.json({ message: "User registered successfully." }, { status: 201 });
  } catch (error) {
    if (error instanceof RequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Registration failed.");
    return NextResponse.json({ error: "Something went wrong during registration." }, { status: 500 });
  }
}
