// app/api/agents/route.js
import { NextResponse } from "next/server";
import admin from "../db/firebaseAdmin";
import { checkRole, verifyToken } from "../../../../middleware/authMiddleware";
import { sendEmailFun } from "../utils/emailSender";

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

      // Send email to agent if requested
      let emailResult = null;
      if (sendEmail) {
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
        const loginUrl = `${siteUrl}/login`;
        const supportEmail = process.env.SUPPORT_EMAIL || 'support@ssgmsss.com';
        
        const emailContent = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Agent Account Created - SSGMSSS</title>
            <style>
              body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                line-height: 1.6;
                color: #333;
                max-width: 600px;
                margin: 0 auto;
                padding: 20px;
                background-color: #f9f9f9;
              }
              .container {
                background-color: white;
                border-radius: 10px;
                overflow: hidden;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
              }
              .header {
                background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
                padding: 40px 30px;
                text-align: center;
                color: white;
              }
              .header h1 {
                margin: 0;
                font-size: 28px;
                font-weight: 600;
              }
              .header p {
                margin: 10px 0 0;
                opacity: 0.9;
                font-size: 16px;
              }
              .content {
                padding: 40px 30px;
              }
              .welcome-text {
                font-size: 18px;
                margin-bottom: 30px;
                color: #444;
              }
              .credentials-box {
                background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
                border: 1px solid #bae6fd;
                border-radius: 10px;
                padding: 25px;
                margin: 25px 0;
              }
              .credentials-box h3 {
                margin-top: 0;
                color: #0369a1;
                font-size: 20px;
                border-bottom: 2px solid #bae6fd;
                padding-bottom: 10px;
              }
              .credential-item {
                display: flex;
                margin: 15px 0;
                align-items: center;
              }
              .credential-label {
                font-weight: 600;
                color: #0c4a6e;
                width: 120px;
                min-width: 120px;
              }
              .credential-value {
                background: white;
                padding: 10px 15px;
                border-radius: 6px;
                border: 1px solid #cbd5e1;
                flex-grow: 1;
                font-family: monospace;
                color: #1e293b;
              }
              .highlight {
                background-color: #fff7ed;
                border: 1px solid #fed7aa;
                padding: 15px;
                border-radius: 8px;
                margin: 20px 0;
                color: #9a3412;
              }
              .highlight strong {
                color: #ea580c;
              }
              .login-btn {
                display: inline-block;
                background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
                color: white;
                text-decoration: none;
                padding: 15px 30px;
                border-radius: 8px;
                font-weight: 600;
                font-size: 16px;
                margin: 20px 0;
                text-align: center;
                transition: transform 0.2s;
              }
              .login-btn:hover {
                transform: translateY(-2px);
              }
              .instructions {
                background-color: #f8fafc;
                border-left: 4px solid #4f46e5;
                padding: 20px;
                margin: 25px 0;
                border-radius: 0 8px 8px 0;
              }
              .instructions h4 {
                margin-top: 0;
                color: #4f46e5;
              }
              .instructions ul {
                padding-left: 20px;
              }
              .instructions li {
                margin: 8px 0;
              }
              .support {
                text-align: center;
                margin-top: 30px;
                padding-top: 20px;
                border-top: 1px solid #e2e8f0;
                color: #64748b;
                font-size: 14px;
              }
              .footer {
                text-align: center;
                padding: 20px;
                background-color: #f1f5f9;
                color: #64748b;
                font-size: 12px;
              }
              @media (max-width: 600px) {
                .content {
                  padding: 20px 15px;
                }
                .credential-item {
                  flex-direction: column;
                  align-items: flex-start;
                }
                .credential-label {
                  width: 100%;
                  margin-bottom: 5px;
                }
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>Agent Account Created</h1>
                <p>SSGMSSS - Sports & Social Welfare Management System</p>
              </div>
              
              <div class="content">
                <div class="welcome-text">
                  Hello <strong>${name}</strong>,<br>
                  Your agent account has been successfully created in the SSGMSSS portal.
                </div>
                
                <div class="credentials-box">
                  <h3>Your Login Credentials</h3>
                  
                  <div class="credential-item">
                    <div class="credential-label">Email:</div>
                    <div class="credential-value">${email}</div>
                  </div>
                  
                  <div class="credential-item">
                    <div class="credential-label">Password:</div>
                    <div class="credential-value">${agentPassword}</div>
                  </div>
                  
                  <div class="credential-item">
                    <div class="credential-label">Login URL:</div>
                    <div class="credential-value">${loginUrl}</div>
                  </div>
                </div>
                
                <div class="highlight">
                  <strong>Important:</strong> Please change your password immediately after first login for security.
                </div>
                
                <center>
                  <a href="${loginUrl}" class="login-btn" style="color: white;">
                    Login to Agent Portal
                  </a>
                </center>
                
                <div class="instructions">
                  <h4>Getting Started Guide:</h4>
                  <ul>
                    <li>Use the credentials above to login to the agent portal</li>
                    <li>Complete your profile setup after login</li>
                    <li>Explore the dashboard to understand features</li>
                    <li>Start registering members in your assigned programs</li>
                    <li>Track member registrations and payments</li>
                    <li>Generate reports for your activities</li>
                  </ul>
                </div>
                
                <div class="support">
                  <p>Need help? Contact our support team at <a href="mailto:${supportEmail}">${supportEmail}</a></p>
                  <p>This is an automated email. Please do not reply directly to this message.</p>
                </div>
              </div>
              
              <div class="footer">
                <p>&copy; ${new Date().getFullYear()} SSGMSSS. All rights reserved.</p>
                <p>This email was sent to ${email}</p>
              </div>
            </div>
          </body>
          </html>
        `;

        emailResult = await sendEmailFun({
          to: email,
          subject: 'Your Agent Account Has Been Created - SSGMSSS',
          html: emailContent,
          text: `Hello ${name},\n\nYour agent account has been created.\n\nEmail: ${email}\nPassword: ${agentPassword}\nLogin URL: ${loginUrl}\n\nPlease change your password after first login.\n\nFor support, contact: ${supportEmail}`
        });

        console.log('📧 Email send result:', emailResult);
      }

      const responseData = {
        success: true,
        message: "Agent created successfully",
        data: {
          ...agentData,
          tempPassword: !password ? agentPassword : undefined,
          emailSent: sendEmail ? (emailResult?.success || false) : null,
          emailMessage: sendEmail ? (emailResult?.message || emailResult?.error) : null
        }
      };

      return NextResponse.json(responseData, { status: 201 });

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