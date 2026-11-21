const welcomeTemplate = (name = "User", status = "created") => {
    return {
        subject: "Welcome to Chatterly 🎉",

        text: `Hi ${name}, welcome to Chatterly!`,

        html: `
      <!DOCTYPE html>
<html>
<head>
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<style>
  body {
    margin:0;
    padding:0;
    background:#f4f6f8;
    font-family:'Segoe UI', Helvetica, Arial, sans-serif;
  }

  .container {
    max-width:480px;
    margin:auto;
    background:#ffffff;
    border-radius:12px;
    padding:30px;
    box-shadow:0 4px 20px rgba(0,0,0,0.05);
  }

  .brand {
    font-size:22px;
    font-weight:600;
    color:#111;
  }

  .title {
    text-align:center;
    font-size:20px;
    color:#111;
    margin-bottom:10px;
  }

  .text {
    text-align:center;
    font-size:14px;
    color:#555;
  }

  .feature-box {
    margin:25px 0;
    padding:18px;
    background:#eef2ff;
    border-radius:10px;
    font-size:14px;
    color:#4F46E5;
    line-height:1.7;
    text-align:left;
  }

  .footer {
    text-align:center;
    font-size:12px;
    color:#999;
  }

  hr {
    border:none;
    border-top:1px solid #eee;
    margin:25px 0;
  }

  /* 🌙 Dark Mode */
  @media (prefers-color-scheme: dark) {
    body {
      background:#0f172a !important;
    }

    .container {
      background:#1e293b !important;
      box-shadow:none !important;
    }

    .brand {
      color:#f1f5f9 !important;
    }

    .title {
      color:#f8fafc !important;
    }

    .text {
      color:#cbd5f5 !important;
    }

    .feature-box {
      background:#312e81 !important;
      color:#e0e7ff !important;
    }

    .footer {
      color:#94a3b8 !important;
    }

    hr {
      border-top:1px solid #334155 !important;
    }

    svg path, svg circle {
      stroke:#a5b4fc !important;
      fill:#a5b4fc !important;
    }
  }
</style>
</head>

<body>

<div style="padding:30px 15px;">

  <div class="container">

    <!-- Header -->
    <div style="text-align:center; margin-bottom:20px;">
      <div style="display:inline-flex; align-items:center; gap:10px;">
        
        <!-- Logo -->
        <svg width="36" height="36" viewBox="0 0 100 100" fill="none">
          <path d="M18 78 V 38 C 18 22 30 16 48 16 H 65 C 85 16 92 28 92 46 C 92 64 85 72 65 72 H 35 L 18 78 Z" stroke="#4F46E5" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"></path>
          <path d="M28 72 C 35 88 65 92 88 66" stroke="#4F46E5" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"></path>
          <circle cx="36" cy="46" r="5" fill="#4F46E5"></circle>
          <circle cx="55" cy="46" r="5" fill="#4F46E5"></circle>
          <circle cx="74" cy="46" r="5" fill="#4F46E5"></circle>
        </svg>

        <span class="brand">Chatterly</span>
      </div>
    </div>

    <!-- Title -->
    <h2 class="title">Welcome to Chatterly 🎉</h2>

    <!-- Greeting -->
    <p class="text">
      Hi <b>${name}</b> 👋 <br/>
      Your account has been successfully ${status}.
    </p>

    <!-- Features -->
    <div class="feature-box">
      🚀 Discover contacts <br/>
      💬 Start conversations instantly <br/>
      🔒 Secure and private messaging
    </div>

    <!-- Note -->
    <p class="text">
      You're now ready to start exploring and connecting with others.
    </p>

    <hr>

    <!-- Footer -->
    <p class="footer">
      Welcome aboard! Let’s build great conversations together 🚀 <br/>
      If you didn’t sign up, please ignore this email.
    </p>

  </div>

</div>

</body>
</html>
    `,
    };
};

export default welcomeTemplate;