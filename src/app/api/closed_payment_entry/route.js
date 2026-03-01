import { NextResponse } from "next/server";
import admin from "../db/firebaseAdmin";
import { checkRole, verifyToken } from "../../../../middleware/authMiddleware";

const db = admin.firestore();

const getMembersGenrateEntry = async (body) => {
  const { programId, ageGroups = [], memberGroups = [], memberClosingList = [] } = body;

  const parseDDMMYYYY = (dateStr) => {
    if (!dateStr || typeof dateStr !== 'string') return null;
    const [day, month, year] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
  };

  try {
    let q = db.collectionGroup("memberPrograms").where("programId", "==", programId);
    if (ageGroups.length) q = q.where("ageGroupId", "in", ageGroups.slice(0, 10));
    if (memberGroups.length) q = q.where("memberGroupId", "in", memberGroups.slice(0, 10));

    const snap = await q.get();
    if (snap.empty) return [];

    const result = {};

    for (const doc of snap.docs) {
      const program = { id: doc.id, ...doc.data() };
      const memberId = program.memberId;
      if (!memberId) continue;

      if (!result[memberId]) {
        const memberDoc = await db.collection("members").doc(memberId).get();
        if (!memberDoc.exists) continue;

        const memberData = memberDoc.data();
        const joinDateObj = parseDDMMYYYY(memberData.dateJoin);
        
        // Member ki apni purani closing date (agar hai toh)
        const memberSelfClosedDate = memberData.closed_date ? new Date(memberData.closed_date) : null;

        // 1️⃣ Filter the closing list
        const allowedClosings = memberClosingList.filter(closing => {
          // Note: Here we don't check closing.memberId !== memberId because this list
          // represents the people getting married NOW, but we use their dates to 
          // calculate entries for ALL members.
          
          const closingDateStr = closing.closed_date || closing.marriageDate;
          if (!closingDateStr) return false;
          const currentClosingDateObj = new Date(closingDateStr);
          
          // ✅ Condition A: Join Date must be on or before this closing date
          const isJoined = joinDateObj.getTime() <= currentClosingDateObj.getTime();

          // ✅ Condition B: If member is already closed, they must have closed 
          // ON or AFTER this specific closing date to be included.
          let isStillActive = true;
          if (memberData.member_closed === true && memberSelfClosedDate) {
             // Agar member pehle hi close ho gaya tha is date se, toh skip
             if (memberSelfClosedDate.getTime() < currentClosingDateObj.getTime()) {
               isStillActive = false;
             }
          }

          return isJoined && isStillActive;
        });

        // 2️⃣ Skip member if no records in the list match their timeline
        if (allowedClosings.length === 0) continue;

        // 3️⃣ Final Calculation
        const calculate_Amout = allowedClosings.length * (memberData.payAmount || 0);

        result[memberId] = {
          id: memberDoc.id,
          ...memberData,
          memberPrograms: [],
          calculate_Amout,
          validClosingsCount: allowedClosings.length
        };
      }
      result[memberId].memberPrograms.push(program);
    }

    return Object.values(result);

  } catch (error) {
    console.error("Error:", error);
    throw error;
  }
}

export async function POST(req) {
  const authResult = await verifyToken(req);
  if (!authResult.success) {
    return NextResponse.json(
      { success: false, message: authResult.error },
      { status: authResult.status }
    );
  }

  if (!checkRole(['superadmin', 'admin'], authResult.user.role)) {
    return NextResponse.json(
      { success: false, message: "No Permission" },
      { status: 403 }
    );
  }

 const body = await req.json();

  try {
      const membersList=await getMembersGenrateEntry(body)
      console.log(membersList,'membersList')
    return NextResponse.json({
      success: true,
      data: membersList
    });

  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { success: false, message: "Server Error" },
      { status: 500 }
    );
  }
}