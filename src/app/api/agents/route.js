// app/api/agents/route.js
import { NextResponse } from "next/server";
import admin from "../db/firebaseAdmin";
import { checkRole, verifyToken } from "../../../../middleware/authMiddleware";

const db = admin.firestore();
const auth = admin.auth();
const bucket = admin.storage().bucket();

// Helper to generate random password
const generatePassword = (length = 12) => {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%";
  let password = "";
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return password;
};

// Helper to delete file from Firebase Storage
const deleteFileFromStorage = async (fileUrl) => {
  if (!fileUrl) return;
  
  try {
    const filePath = decodeURIComponent(fileUrl.split('/o/')[1]?.split('?')[0] || '');
    if (filePath) {
      const file = bucket.file(filePath);
      const [exists] = await file.exists();
      if (exists) {
        await file.delete();
        console.log(`Deleted file: ${filePath}`);
      }
    }
  } catch (error) {
    console.error("Error deleting file:", error);
    // Don't throw error for file deletion failures
  }
};

// Helper to handle base64 file upload
const uploadBase64ToStorage = async (base64Data, filename, path, agentId) => {
  if (!base64Data || !base64Data.data) return null;
  
  try {
    const timestamp = Date.now();
    const fileExtension = filename.split('.').pop() || 'jpg';
    const fileName = `${agentId}/${path}_${timestamp}.${fileExtension}`;
    const fileRef = bucket.file(`agents/${fileName}`);
    
    // Convert base64 to buffer
    const buffer = Buffer.from(base64Data.data, 'base64');
    
    await fileRef.save(buffer, {
      metadata: {
        contentType: base64Data.type || 'application/octet-stream',
      },
    });
    
    // Get public URL
    const [url] = await fileRef.getSignedUrl({
      action: 'read',
      expires: '03-01-2500', // Far future expiration
    });
    
    return url;
  } catch (error) {
    console.error(`Error uploading ${path}:`, error);
    throw error;
  }
};

// GET - Fetch all agents or single agent
export async function GET(req) {
  try {
    // Verify token
    const authResult = await verifyToken(req);
    if (!authResult.success) {
      return NextResponse.json(
        { success: false, message: authResult.error },
        { status: authResult.status }
      );
    }

    const currentUser = authResult.user;

    // Check permission - superadmin, admin can view all agents
    if (!checkRole(['superadmin', 'admin'], currentUser.role)) {
      return NextResponse.json(
        { success: false, message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const agentId = searchParams.get("id");
    const status = searchParams.get("status");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const search = searchParams.get("search");

    // Get single agent by ID
    if (agentId) {
      const agentDoc = await db.collection("agents").doc(agentId).get();
      
      if (!agentDoc.exists) {
        return NextResponse.json(
          { success: false, message: "Agent not found" },
          { status: 404 }
        );
      }

      const agentData = { id: agentDoc.id, ...agentDoc.data() };
      
      return NextResponse.json({
        success: true,
        data: agentData
      });
    }

    // Get all agents with filters
    let query = db.collection("agents").where("delete_flag", "==", false);

    // Apply status filter
    if (status && status !== "all") {
      query = query.where("status", "==", status);
    }

    // Get total count
    const countSnapshot = await query.get();
    const total = countSnapshot.size;
    const totalPages = Math.ceil(total / limit);

    // Apply pagination
    const offset = (page - 1) * limit;
    const agentsSnapshot = await query
      .orderBy("created_at", "desc")
      .limit(limit)
      .offset(offset)
      .get();

    let agents = [];
    agentsSnapshot.forEach(doc => {
      agents.push({ id: doc.id, ...doc.data() });
    });

    // Apply search filter if provided
    if (search && search.trim()) {
      const searchLower = search.toLowerCase();
      agents = agents.filter(agent => 
        agent.name?.toLowerCase().includes(searchLower) ||
        agent.email?.toLowerCase().includes(searchLower) ||
        agent.phone1?.includes(search) ||
        agent.aadharNo?.includes(search) ||
        agent.city?.toLowerCase().includes(searchLower) ||
        agent.state?.toLowerCase().includes(searchLower)
      );
    }

    return NextResponse.json({
      success: true,
      data: agents,
      pagination: {
        page,
        limit,
        total: agents.length,
        totalPages: Math.ceil(agents.length / limit),
        hasNextPage: page < Math.ceil(agents.length / limit),
        hasPrevPage: page > 1
      }
    });

  } catch (error) {
    console.error("GET agents error:", error);
    return NextResponse.json(
      { success: false, message: "Server error", error: error.message },
      { status: 500 }
    );
  }
}

// POST - Create new agent
export async function POST(req) {
  try {
    // Verify token
    const authResult = await verifyToken(req);
    if (!authResult.success) {
      return NextResponse.json(
        { success: false, message: authResult.error },
        { status: authResult.status }
      );
    }

    const currentUser = authResult.user;
    
    // Check permission - only superadmin and admin can create agents
    if (!checkRole(['superadmin', 'admin'], currentUser.role)) {
      return NextResponse.json(
        { success: false, message: 'Insufficient permissions to create agents' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const {
      name,
      fatherName,
      email,
      phone1,
      phone2,
      password,
      caste,
      aadharNo,
      state,
      district,
      city,
      village,
      pincode,
      photoFile,
      signatureFile,
      document1File,
      document2File,
      document3File,
      sendEmail = false,
      status = "active"
    } = body;

    // Validation
    if (!name || !email || !phone1 || !aadharNo) {
      return NextResponse.json(
        { success: false, message: "Name, email, phone, and Aadhar are required" },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { success: false, message: "Invalid email format" },
        { status: 400 }
      );
    }

    // Validate phone format
    const phoneRegex = /^\d{10}$/;
    if (!phoneRegex.test(phone1)) {
      return NextResponse.json(
        { success: false, message: "Phone number must be 10 digits" },
        { status: 400 }
      );
    }

    // Validate Aadhar format
    const aadharRegex = /^\d{12}$/;
    if (!aadharRegex.test(aadharNo)) {
      return NextResponse.json(
        { success: false, message: "Aadhar number must be 12 digits" },
        { status: 400 }
      );
    }

    // Check if agent already exists by email
    const existingAgentQuery = await db
      .collection("agents")
      .where("email", "==", email)
      .where("delete_flag", "==", false)
      .limit(1)
      .get();

    if (!existingAgentQuery.empty) {
      return NextResponse.json(
        { success: false, message: "Agent with this email already exists" },
        { status: 400 }
      );
    }

    // Check if Aadhar already exists
    const existingAadharQuery = await db
      .collection("agents")
      .where("aadharNo", "==", aadharNo)
      .where("delete_flag", "==", false)
      .limit(1)
      .get();

    if (!existingAadharQuery.empty) {
      return NextResponse.json(
        { success: false, message: "Agent with this Aadhar number already exists" },
        { status: 400 }
      );
    }

    // Generate password if not provided
    const agentPassword = password || generatePassword();
    let uid;
    let agentRef;

    try {
      // Create agent in Firebase Auth
      const authUser = await auth.createUser({
        email,
        password: agentPassword,
        displayName: name,
        phoneNumber: `+91${phone1}`,
        disabled: status === "inactive",
        emailVerified: false
      });
      
      uid = authUser.uid;
      
      // Set custom claims for role
      await auth.setCustomUserClaims(authUser.uid, {
        role: "agent",
        createdBy: currentUser.uid
      });

      // Create agent in Firestore first to get ID
      agentRef = db.collection("agents").doc();
      const agentId = agentRef.id;

      // Upload files if provided (handle base64)
      let photoUrl = '';
      let signatureUrl = '';
      let document1Url = '';
      let document2Url = '';
      let document3Url = '';

      if (photoFile && photoFile.data) {
        photoUrl = await uploadBase64ToStorage(photoFile, photoFile.name, 'photo', agentId);
      }

      if (signatureFile && signatureFile.data) {
        signatureUrl = await uploadBase64ToStorage(signatureFile, signatureFile.name, 'signature', agentId);
      }

      if (document1File && document1File.data) {
        document1Url = await uploadBase64ToStorage(document1File, document1File.name, 'document1', agentId);
      }

      if (document2File && document2File.data) {
        document2Url = await uploadBase64ToStorage(document2File, document2File.name, 'document2', agentId);
      }

      if (document3File && document3File.data) {
        document3Url = await uploadBase64ToStorage(document3File, document3File.name, 'document3', agentId);
      }

      // Create agent data
      const agentData = {
        id: agentId,
        uid,
        name,
        fatherName: fatherName || "",
        email,
        phone1,
        phone2: phone2 || "",
        caste: caste || "",
        aadharNo,
        state: state || "",
        district: district || "",
        city: city || "",
        village: village || "",
        pincode: pincode || "",
        photoUrl,
        signatureUrl,
        document1Url,
        document2Url,
        document3Url,
        status,
        role: "agent",
        active_flag: true,
        delete_flag: false,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: currentUser.uid,
        lastPasswordReset: new Date().toISOString()
      };

      // Save to Firestore
      await agentRef.set(agentData);



      return NextResponse.json({
        success: true,
        message: "Agent created successfully",
        data: {
          ...agentData,
          tempPassword: !password ? agentPassword : undefined
        }
      }, { status: 201 });

    } catch (error) {
      console.error("POST agents error:", error);
      
      // Cleanup: If Auth user was created but Firestore failed
      if (uid) {
        try {
          await auth.deleteUser(uid);
          console.log("Cleaned up Auth user after failure");
        } catch (deleteError) {
          console.error("Failed to cleanup auth user:", deleteError);
        }
      }
      
      throw error;
    }

  } catch (error) {
    console.error("POST agents error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to create agent", error: error.message },
      { status: 500 }
    );
  }
}

// PUT - Update agent
export async function PUT(req) {
  try {
    // Verify token
    const authResult = await verifyToken(req);
    if (!authResult.success) {
      return NextResponse.json(
        { success: false, message: authResult.error },
        { status: authResult.status }
      );
    }

    const currentUser = authResult.user;
    
    // Check permission
    if (!checkRole(['superadmin', 'admin'], currentUser.role)) {
      return NextResponse.json(
        { success: false, message: 'Insufficient permissions to update agents' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { 
      id, 
      updatePassword, 
      photoFile, 
      signatureFile, 
      document1File, 
      document2File, 
      document3File,
      ...updateData 
    } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, message: "Agent ID is required" },
        { status: 400 }
      );
    }

    // Get existing agent
    const agentDoc = await db.collection("agents").doc(id).get();
    if (!agentDoc.exists) {
      return NextResponse.json(
        { success: false, message: "Agent not found" },
        { status: 404 }
      );
    }

    const existingAgent = agentDoc.data();

    // Check if email is being changed and if it already exists
    if (updateData.email && updateData.email !== existingAgent.email) {
      const emailCheck = await db
        .collection("agents")
        .where("email", "==", updateData.email)
        .where("delete_flag", "==", false)
        .limit(1)
        .get();
      
      if (!emailCheck.empty && emailCheck.docs[0].id !== id) {
        return NextResponse.json(
          { success: false, message: "Email already in use by another agent" },
          { status: 400 }
        );
      }
    }

    // Check if Aadhar is being changed and if it already exists
    if (updateData.aadharNo && updateData.aadharNo !== existingAgent.aadharNo) {
      const aadharCheck = await db
        .collection("agents")
        .where("aadharNo", "==", updateData.aadharNo)
        .where("delete_flag", "==", false)
        .limit(1)
        .get();
      
      if (!aadharCheck.empty && aadharCheck.docs[0].id !== id) {
        return NextResponse.json(
          { success: false, message: "Aadhar number already in use by another agent" },
          { status: 400 }
        );
      }
    }

    // Upload new files and delete old ones if needed
    let photoUrl = existingAgent.photoUrl;
    let signatureUrl = existingAgent.signatureUrl;
    let document1Url = existingAgent.document1Url;
    let document2Url = existingAgent.document2Url;
    let document3Url = existingAgent.document3Url;

    // Handle file updates
    if (photoFile && photoFile.data) {
      if (existingAgent.photoUrl) {
        await deleteFileFromStorage(existingAgent.photoUrl);
      }
      photoUrl = await uploadBase64ToStorage(photoFile, photoFile.name, 'photo', id);
    }

    if (signatureFile && signatureFile.data) {
      if (existingAgent.signatureUrl) {
        await deleteFileFromStorage(existingAgent.signatureUrl);
      }
      signatureUrl = await uploadBase64ToStorage(signatureFile, signatureFile.name, 'signature', id);
    }

    if (document1File && document1File.data) {
      if (existingAgent.document1Url) {
        await deleteFileFromStorage(existingAgent.document1Url);
      }
      document1Url = await uploadBase64ToStorage(document1File, document1File.name, 'document1', id);
    }

    if (document2File && document2File.data) {
      if (existingAgent.document2Url) {
        await deleteFileFromStorage(existingAgent.document2Url);
      }
      document2Url = await uploadBase64ToStorage(document2File, document2File.name, 'document2', id);
    }

    if (document3File && document3File.data) {
      if (existingAgent.document3Url) {
        await deleteFileFromStorage(existingAgent.document3Url);
      }
      document3Url = await uploadBase64ToStorage(document3File, document3File.name, 'document3', id);
    }

    // Prepare update data
    const updates = {
      ...updateData,
      photoUrl: photoFile && photoFile.data ? photoUrl : existingAgent.photoUrl,
      signatureUrl: signatureFile && signatureFile.data ? signatureUrl : existingAgent.signatureUrl,
      document1Url: document1File && document1File.data ? document1Url : existingAgent.document1Url,
      document2Url: document2File && document2File.data ? document2Url : existingAgent.document2Url,
      document3Url: document3File && document3File.data ? document3Url : existingAgent.document3Url,
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    };

    // Remove undefined values
    Object.keys(updates).forEach(key => 
      updates[key] === undefined && delete updates[key]
    );

    // Update Firebase Auth if email, phone, or password changed
    if (existingAgent.uid) {
      const authUpdates = {};
      
      if (updateData.name) authUpdates.displayName = updateData.name;
      if (updateData.email && updateData.email !== existingAgent.email) {
        authUpdates.email = updateData.email;
        authUpdates.emailVerified = false;
      }
      if (updateData.phone1 && updateData.phone1 !== existingAgent.phone1) {
        authUpdates.phoneNumber = `+91${updateData.phone1}`;
      }
      if (photoFile && photoFile.data) {
        authUpdates.photoURL = photoUrl || null;
      }
      if (updateData.status !== undefined) {
        authUpdates.disabled = updateData.status === "inactive";
      }
      if (updatePassword) {
        authUpdates.password = updatePassword;
        updates.lastPasswordReset = new Date().toISOString();
      }

      if (Object.keys(authUpdates).length > 0) {
        try {
          await auth.updateUser(existingAgent.uid, authUpdates);
        } catch (authError) {
          console.error("Auth update error:", authError);
          return NextResponse.json(
            { success: false, message: "Failed to update agent auth", error: authError.message },
            { status: 400 }
          );
        }
      }

      // Also update users collection
      try {
        const userUpdates = {
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };
        
        if (updateData.name) userUpdates.name = updateData.name;
        if (updateData.email) userUpdates.email = updateData.email;
        if (updateData.phone1) userUpdates.phone = updateData.phone1;
        if (photoFile && photoFile.data) userUpdates.photoURL = photoUrl || "";
        if (updateData.status !== undefined) userUpdates.status = updateData.status;
        
        await db.collection("users").doc(existingAgent.uid).update(userUpdates);
      } catch (userError) {
        console.warn("Failed to update users collection:", userError);
        // Continue even if users update fails
      }
    }

    // Update agent in Firestore
    await db.collection("agents").doc(id).update(updates);

    // Get updated agent
    const updatedDoc = await db.collection("agents").doc(id).get();
    const updatedAgent = { id: updatedDoc.id, ...updatedDoc.data() };

    return NextResponse.json({
      success: true,
      message: "Agent updated successfully",
      data: updatedAgent
    });

  } catch (error) {
    console.error("PUT agents error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update agent", error: error.message },
      { status: 500 }
    );
  }
}

// DELETE - Delete agent (soft delete)
export async function DELETE(req) {
  try {
    // Verify token
    const authResult = await verifyToken(req);
    if (!authResult.success) {
      return NextResponse.json(
        { success: false, message: authResult.error },
        { status: authResult.status }
      );
    }

    const currentUser = authResult.user;
    
    // Check permission - only superadmin can delete agents
    if (!checkRole(['superadmin'], currentUser.role)) {
      return NextResponse.json(
        { success: false, message: 'Only super admin can delete agents' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const hardDelete = searchParams.get("hard") === "true";

    if (!id) {
      return NextResponse.json(
        { success: false, message: "Agent ID is required" },
        { status: 400 }
      );
    }

    // Get agent
    const agentDoc = await db.collection("agents").doc(id).get();
    if (!agentDoc.exists) {
      return NextResponse.json(
        { success: false, message: "Agent not found" },
        { status: 404 }
      );
    }

    const agent = agentDoc.data();

    // Delete files from storage if hard delete
    if (hardDelete && agent.uid) {
      if (agent.photoUrl) await deleteFileFromStorage(agent.photoUrl);
      if (agent.signatureUrl) await deleteFileFromStorage(agent.signatureUrl);
      if (agent.document1Url) await deleteFileFromStorage(agent.document1Url);
      if (agent.document2Url) await deleteFileFromStorage(agent.document2Url);
      if (agent.document3Url) await deleteFileFromStorage(agent.document3Url);
    }

    if (hardDelete) {
      // Hard delete - remove from Auth and Firestore
      if (agent.uid) {
        try {
          await auth.deleteUser(agent.uid);
          await db.collection("users").doc(agent.uid).delete();
        } catch (authError) {
          console.error("Auth delete error:", authError);
        }
      }

      await db.collection("agents").doc(id).delete();
      
      return NextResponse.json({
        success: true,
        message: "Agent permanently deleted"
      });
    } else {
      // Soft delete - mark as deleted
      await db.collection("agents").doc(id).update({
        delete_flag: true,
        active_flag: false,
        status: "inactive",
        deleted_at: admin.firestore.FieldValue.serverTimestamp(),
        deleted_by: currentUser.uid,
        updated_at: admin.firestore.FieldValue.serverTimestamp()
      });

      // Disable in Auth
      if (agent.uid) {
        try {
          await auth.updateUser(agent.uid, { disabled: true });
          await db.collection("users").doc(agent.uid).update({
            delete_flag: true,
            active_flag: false,
            status: "inactive",
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
        } catch (authError) {
          console.error("Auth disable error:", authError);
        }
      }

      return NextResponse.json({
        success: true,
        message: "Agent deleted successfully"
      });
    }

  } catch (error) {
    console.error("DELETE agents error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to delete agent", error: error.message },
      { status: 500 }
    );
  }
}

// PATCH - Update agent status
export async function PATCH(req) {
  try {
    // Verify token
    const authResult = await verifyToken(req);
    if (!authResult.success) {
      return NextResponse.json(
        { success: false, message: authResult.error },
        { status: authResult.status }
      );
    }

    const currentUser = authResult.user;
    
    // Check permission
    if (!checkRole(['superadmin', 'admin'], currentUser.role)) {
      return NextResponse.json(
        { success: false, message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { id, status } = body;

    if (!id || !status) {
      return NextResponse.json(
        { success: false, message: "Agent ID and status are required" },
        { status: 400 }
      );
    }

    if (!['active', 'inactive'].includes(status)) {
      return NextResponse.json(
        { success: false, message: "Invalid status. Must be 'active' or 'inactive'" },
        { status: 400 }
      );
    }

    // Get agent
    const agentDoc = await db.collection("agents").doc(id).get();
    if (!agentDoc.exists) {
      return NextResponse.json(
        { success: false, message: "Agent not found" },
        { status: 404 }
      );
    }

    const agent = agentDoc.data();

    // Update Firestore
    await db.collection("agents").doc(id).update({
      status,
      active_flag: status === "active",
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });

    // Update Auth
    if (agent.uid) {
      try {
        await auth.updateUser(agent.uid, {
          disabled: status === "inactive"
        });
        
        await db.collection("users").doc(agent.uid).update({
          status,
          active_flag: status === "active",
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      } catch (authError) {
        console.error("Auth update error:", authError);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Agent marked as ${status}`,
      data: { id, status }
    });

  } catch (error) {
    console.error("PATCH agents error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update agent status", error: error.message },
      { status: 500 }
    );
  }
}