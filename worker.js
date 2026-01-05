// worker.js - Cloudflare Worker untuk Sistem Login TKA
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers untuk development
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle OPTIONS preflight request
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Routing
    if (path === '/api/login' && request.method === 'POST') {
      return handleLogin(request, env);
    } else if (path === '/api/register' && request.method === 'POST') {
      return handleRegister(request, env);
    } else if (path === '/api/students' && request.method === 'GET') {
      return handleGetStudents(request, env);
    } else if (path.startsWith('/api/student/') && request.method === 'GET') {
      return handleGetStudent(request, env, path);
    } else if (path === '/api/results' && request.method === 'GET') {
      return handleGetResults(request, env);
    } else if (path === '/api/reset-demo' && request.method === 'POST') {
      return handleResetDemo(request, env);
    }

    // Serve HTML untuk frontend
    if (path === '/' || path === '/index.html') {
      return serveHTML(env);
    }

    return new Response('Not Found', { 
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'text/plain' }
    });
  },
};

// Handler untuk login
async function handleLogin(request, env) {
  try {
    const body = await request.json();
    const { nisn, birthdate } = body;

    // Validasi input
    if (!nisn || !birthdate) {
      return jsonResponse({ error: 'NISN dan tanggal lahir diperlukan' }, 400);
    }

    // Format NISN harus 10 digit
    if (nisn.length !== 10 || !/^\d+$/.test(nisn)) {
      return jsonResponse({ error: 'NISN harus 10 digit angka' }, 400);
    }

    // Format tanggal: DD-MM-YYYY
    const dateRegex = /^(\d{2})-(\d{2})-(\d{4})$/;
    if (!dateRegex.test(birthdate)) {
      return jsonResponse({ error: 'Format tanggal harus DD-MM-YYYY' }, 400);
    }

    // Cek di database KV
    const studentKey = `student:${nisn}`;
    const studentData = await env.TKA_DB.get(studentKey, 'json');

    if (!studentData) {
      return jsonResponse({ error: 'NISN tidak ditemukan' }, 404);
    }

    // Verifikasi tanggal lahir
    if (studentData.birthdate !== birthdate) {
      return jsonResponse({ error: 'Tanggal lahir tidak sesuai' }, 401);
    }

    // Hapus password dari response
    delete studentData.password;

    return jsonResponse({
      success: true,
      message: 'Login berhasil',
      student: studentData
    });

  } catch (error) {
    console.error('Login error:', error);
    return jsonResponse({ error: 'Terjadi kesalahan server' }, 500);
  }
}

// Handler untuk registrasi siswa baru
async function handleRegister(request, env) {
  try {
    const body = await request.json();
    const { 
      nisn, 
      birthdate, 
      name, 
      place_of_birth,
      test_number,
      password 
    } = body;

    // Validasi input
    if (!nisn || !birthdate || !name) {
      return jsonResponse({ error: 'Data tidak lengkap' }, 400);
    }

    // Format NISN harus 10 digit
    if (nisn.length !== 10 || !/^\d+$/.test(nisn)) {
      return jsonResponse({ error: 'NISN harus 10 digit angka' }, 400);
    }

    // Cek jika siswa sudah terdaftar
    const studentKey = `student:${nisn}`;
    const existingStudent = await env.TKA_DB.get(studentKey);
    
    if (existingStudent) {
      return jsonResponse({ error: 'NISN sudah terdaftar' }, 409);
    }

    // Data siswa baru
    const studentData = {
      nisn,
      birthdate,
      name: name || 'Siswa SMAN 2 Cikbar',
      place_of_birth: place_of_birth || 'Bekasi',
      test_number: test_number || `T3-25-02-12-1005-0009-8 ${nisn}`,
      npsn_school: '69964653',
      npsn_executor: '69964653',
      test_date: '3 - 6 November 2025',
      registration_date: new Date().toISOString(),
      password: password || 'default123' // Dalam produksi, hash password
    };

    // Simpan ke KV
    await env.TKA_DB.put(studentKey, JSON.stringify(studentData));

    // Tambahkan ke list siswa
    const studentsListKey = 'students:list';
    let studentsList = await env.TKA_DB.get(studentsListKey, 'json') || [];
    studentsList.push(nisn);
    await env.TKA_DB.put(studentsListKey, JSON.stringify(studentsList));

    return jsonResponse({
      success: true,
      message: 'Registrasi berhasil',
      student: {
        nisn,
        name: studentData.name,
        birthdate: studentData.birthdate
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    return jsonResponse({ error: 'Terjadi kesalahan server' }, 500);
  }
}

// Handler untuk mendapatkan daftar siswa
async function handleGetStudents(request, env) {
  try {
    const studentsListKey = 'students:list';
    const studentsList = await env.TKA_DB.get(studentsListKey, 'json') || [];
    
    // Ambil detail setiap siswa
    const students = [];
    for (const nisn of studentsList) {
      const studentKey = `student:${nisn}`;
      const studentData = await env.TKA_DB.get(studentKey, 'json');
      if (studentData) {
        delete studentData.password;
        students.push(studentData);
      }
    }

    return jsonResponse({
      success: true,
      count: students.length,
      students
    });

  } catch (error) {
    console.error('Get students error:', error);
    return jsonResponse({ error: 'Terjadi kesalahan server' }, 500);
  }
}

// Handler untuk mendapatkan data siswa spesifik
async function handleGetStudent(request, env, path) {
  try {
    const nisn = path.split('/').pop();
    
    if (!nisn || nisn.length !== 10) {
      return jsonResponse({ error: 'NISN tidak valid' }, 400);
    }

    const studentKey = `student:${nisn}`;
    const studentData = await env.TKA_DB.get(studentKey, 'json');

    if (!studentData) {
      return jsonResponse({ error: 'Siswa tidak ditemukan' }, 404);
    }

    delete studentData.password;

    // Ambil hasil tes jika ada
    const resultsKey = `results:${nisn}`;
    const testResults = await env.TKA_DB.get(resultsKey, 'json') || getDefaultResults();

    return jsonResponse({
      success: true,
      student: studentData,
      results: testResults
    });

  } catch (error) {
    console.error('Get student error:', error);
    return jsonResponse({ error: 'Terjadi kesalahan server' }, 500);
  }
}

// Handler untuk mendapatkan hasil tes
async function handleGetResults(request, env) {
  try {
    const url = new URL(request.url);
    const nisn = url.searchParams.get('nisn');

    if (!nisn) {
      return jsonResponse({ error: 'NISN diperlukan' }, 400);
    }

    const resultsKey = `results:${nisn}`;
    let testResults = await env.TKA_DB.get(resultsKey, 'json');

    if (!testResults) {
      // Buat hasil tes default
      testResults = getDefaultResults();
      await env.TKA_DB.put(resultsKey, JSON.stringify(testResults));
    }

    return jsonResponse({
      success: true,
      results: testResults
    });

  } catch (error) {
    console.error('Get results error:', error);
    return jsonResponse({ error: 'Terjadi kesalahan server' }, 500);
  }
}

// Handler untuk reset data demo
async function handleResetDemo(request, env) {
  try {
    // Data siswa demo
    const demoNISN = '0123456789';
    const demoStudentKey = `student:${demoNISN}`;
    
    const demoStudent = {
      nisn: demoNISN,
      birthdate: '31-12-2008',
      name: 'Siswa SMAN 2 Cikbar',
      place_of_birth: 'Bekasi',
      test_number: 'T3-25-02-12-1005-0009-8 0123456789',
      npsn_school: '69964653',
      npsn_executor: '69964653',
      test_date: '3 - 6 November 2025',
      registration_date: new Date().toISOString(),
      password: 'demo123'
    };

    // Simpan data demo
    await env.TKA_DB.put(demoStudentKey, JSON.stringify(demoStudent));

    // Update list siswa
    const studentsListKey = 'students:list';
    let studentsList = await env.TKA_DB.get(studentsListKey, 'json') || [];
    if (!studentsList.includes(demoNISN)) {
      studentsList.push(demoNISN);
      await env.TKA_DB.put(studentsListKey, JSON.stringify(studentsList));
    }

    // Hasil tes default untuk demo
    const demoResultsKey = `results:${demoNISN}`;
    const demoResults = getDefaultResults();
    await env.TKA_DB.put(demoResultsKey, JSON.stringify(demoResults));

    return jsonResponse({
      success: true,
      message: 'Data demo berhasil direset',
      demo_account: {
        nisn: demoNISN,
        birthdate: '31-12-2008',
        password: 'demo123'
      }
    });

  } catch (error) {
    console.error('Reset demo error:', error);
    return jsonResponse({ error: 'Terjadi kesalahan server' }, 500);
  }
}

// Helper function untuk hasil tes default
function getDefaultResults() {
  return {
    main_subjects: [
      { no: 1, subject: 'Bahasa Indonesia', score: '100.00', category: 'Istimewa' },
      { no: 2, subject: 'Matematika', score: '100.00', category: 'Istimewa' },
      { no: 3, subject: 'Bahasa Inggris', score: '100.00', category: 'Istimewa' }
    ],
    elective_subjects: [
      { no: 4, subject: 'Fisika', score: '100.00', category: 'Istimewa' },
      { no: 5, subject: 'Kimia', score: '100.00', category: 'Istimewa' }
    ],
    test_info: {
      location: 'Kabupaten Bekasi, Provinsi Jawa Barat',
      regulation_number: '9',
      regulation_year: '2025'
    }
  };
}

// Helper function untuk response JSON
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

// Serve HTML frontend
async function serveHTML(env) {
  const html = `<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sistem TKA SMAN 2 Cikarang Barat</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Segoe UI', sans-serif; }
        body { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; display: flex; justify-content: center; align-items: center; padding: 20px; }
        .container { background: white; border-radius: 20px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); overflow: hidden; max-width: 1200px; width: 100%; }
        .header { background: linear-gradient(to right, #3498db, #2ecc71); color: white; padding: 30px; text-align: center; }
        .header h1 { font-size: 2.5rem; margin-bottom: 10px; }
        .header p { opacity: 0.9; }
        .content { padding: 40px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
        .section { background: #f8f9fa; padding: 25px; border-radius: 15px; }
        .section h2 { color: #2c3e50; margin-bottom: 20px; padding-bottom: 10px; border-bottom: 2px solid #3498db; }
        .form-group { margin-bottom: 20px; }
        .form-group label { display: block; margin-bottom: 8px; color: #2c3e50; font-weight: 600; }
        .form-group input, .form-group textarea { width: 100%; padding: 12px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 16px; transition: border-color 0.3s; }
        .form-group input:focus { outline: none; border-color: #3498db; }
        .btn { background: #3498db; color: white; border: none; padding: 15px 30px; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer; transition: all 0.3s; width: 100%; }
        .btn:hover { background: #2980b9; transform: translateY(-2px); }
        .btn-success { background: #2ecc71; }
        .btn-success:hover { background: #27ae60; }
        .btn-danger { background: #e74c3c; }
        .btn-danger:hover { background: #c0392b; }
        .result { display: none; }
        .result.active { display: block; }
        .student-info { background: white; padding: 20px; border-radius: 10px; margin-bottom: 20px; border-left: 5px solid #3498db; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th { background: #3498db; color: white; padding: 15px; text-align: left; }
        td { padding: 15px; border-bottom: 1px solid #e0e0e0; }
        tr:nth-child(even) { background: #f8f9fa; }
        .alert { padding: 15px; border-radius: 8px; margin-bottom: 20px; }
        .alert-success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
        .alert-error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
        .admin-panel { grid-column: 1 / -1; }
        .api-info { background: #2c3e50; color: white; padding: 15px; border-radius: 8px; margin-top: 20px; font-family: monospace; }
        @media (max-width: 768px) {
            .content { grid-template-columns: 1fr; padding: 20px; }
            .header h1 { font-size: 1.8rem; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📚 Sistem TKA SMAN 2 Cikarang Barat</h1>
            <p>Cloudflare Worker + KV Database Backend</p>
        </div>
        <div class="content">
            <div class="section">
                <h2>🔐 Login Siswa</h2>
                <form id="loginForm">
                    <div class="form-group">
                        <label>NISN (10 digit)</label>
                        <input type="text" id="loginNISN" maxlength="10" placeholder="0123456789" required>
                    </div>
                    <div class="form-group">
                        <label>Tanggal Lahir (DD-MM-YYYY)</label>
                        <input type="text" id="loginBirthdate" placeholder="31-12-2008" required>
                    </div>
                    <button type="submit" class="btn">Masuk</button>
                    <button type="button" id="demoBtn" class="btn btn-success" style="margin-top: 10px;">Login Demo</button>
                </form>
                <div id="loginAlert" class="alert" style="display: none;"></div>
            </div>

            <div class="section">
                <h2>📝 Registrasi Siswa Baru</h2>
                <form id="registerForm">
                    <div class="form-group">
                        <label>NISN</label>
                        <input type="text" id="regNISN" maxlength="10" required>
                    </div>
                    <div class="form-group">
                        <label>Nama Lengkap</label>
                        <input type="text" id="regName" required>
                    </div>
                    <div class="form-group">
                        <label>Tempat, Tanggal Lahir</label>
                        <input type="text" id="regBirthInfo" placeholder="Bekasi, 31-12-2008" required>
                    </div>
                    <div class="form-group">
                        <label>Password</label>
                        <input type="password" id="regPassword" required>
                    </div>
                    <button type="submit" class="btn">Daftar</button>
                </form>
                <div id="registerAlert" class="alert" style="display: none;"></div>
            </div>

            <div class="section result" id="resultSection">
                <h2>🎓 Hasil Tes Kompetensi Akademik</h2>
                <div id="studentInfo" class="student-info"></div>
                
                <h3>Mata Pelajaran Utama</h3>
                <table id="mainSubjectsTable">
                    <thead>
                        <tr><th>No</th><th>Mata Pelajaran</th><th>Nilai</th><th>Kategori</th></tr>
                    </thead>
                    <tbody></tbody>
                </table>
                
                <h3>Mata Pelajaran Pilihan</h3>
                <table id="electiveSubjectsTable">
                    <thead>
                        <tr><th>No</th><th>Mata Pelajaran</th><th>Nilai</th><th>Kategori</th></tr>
                    </thead>
                    <tbody></tbody>
                </table>
                
                <button id="logoutBtn" class="btn btn-danger">Keluar</button>
            </div>

            <div class="section admin-panel">
                <h2>⚙️ Admin Panel</h2>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                    <button id="getStudentsBtn" class="btn">Daftar Siswa</button>
                    <button id="resetDemoBtn" class="btn btn-success">Reset Data Demo</button>
                    <button id="testApiBtn" class="btn">Test API</button>
                </div>
                <div id="adminResult" style="margin-top: 20px;"></div>
                
                <div class="api-info">
                    <h4>📡 API Endpoints:</h4>
                    <p>POST /api/login - Login siswa</p>
                    <p>POST /api/register - Registrasi siswa</p>
                    <p>GET /api/students - Daftar semua siswa</p>
                    <p>GET /api/student/{nisn} - Detail siswa</p>
                    <p>GET /api/results?nisn=... - Hasil tes</p>
                    <p>POST /api/reset-demo - Reset data demo</p>
                </div>
            </div>
        </div>
    </div>

    <script>
        const API_BASE_URL = ''; // Gunakan URL Cloudflare Worker Anda
        
        // Format tanggal input
        document.getElementById('loginBirthdate').addEventListener('input', function(e) {
            let value = this.value.replace(/\\D/g, '');
            if (value.length >= 2 && value.length < 4) {
                value = value.slice(0, 2) + '-' + value.slice(2);
            } else if (value.length >= 4 && value.length < 8) {
                value = value.slice(0, 2) + '-' + value.slice(2, 4) + '-' + value.slice(4);
            } else if (value.length >= 8) {
                value = value.slice(0, 2) + '-' + value.slice(2, 4) + '-' + value.slice(4, 8);
            }
            this.value = value;
        });
        
        // Login handler
        document.getElementById('loginForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            const nisn = document.getElementById('loginNISN').value;
            const birthdate = document.getElementById('loginBirthdate').value;
            
            try {
                const response = await fetch(API_BASE_URL + '/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ nisn, birthdate })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    showAlert('loginAlert', 'Login berhasil!', 'success');
                    displayStudentResults(data.student);
                } else {
                    showAlert('loginAlert', data.error || 'Login gagal', 'error');
                }
            } catch (error) {
                showAlert('loginAlert', 'Terjadi kesalahan: ' + error.message, 'error');
            }
        });
        
        // Demo login
        document.getElementById('demoBtn').addEventListener('click', function() {
            document.getElementById('loginNISN').value = '0123456789';
            document.getElementById('loginBirthdate').value = '31-12-2008';
            document.getElementById('loginForm').dispatchEvent(new Event('submit'));
        });
        
        // Registrasi handler
        document.getElementById('registerForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            const nisn = document.getElementById('regNISN').value;
            const name = document.getElementById('regName').value;
            const birthInfo = document.getElementById('regBirthInfo').value;
            const password = document.getElementById('regPassword').value;
            
            // Parse tempat dan tanggal lahir
            const [place_of_birth, birthdate] = birthInfo.includes(',') 
                ? birthInfo.split(',').map(s => s.trim()) 
                : ['Bekasi', birthInfo];
            
            try {
                const response = await fetch(API_BASE_URL + '/api/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ nisn, name, place_of_birth, birthdate, password })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    showAlert('registerAlert', 'Registrasi berhasil! NISN: ' + data.student.nisn, 'success');
                    document.getElementById('registerForm').reset();
                } else {
                    showAlert('registerAlert', data.error || 'Registrasi gagal', 'error');
                }
            } catch (error) {
                showAlert('registerAlert', 'Terjadi kesalahan: ' + error.message, 'error');
            }
        });
        
        // Logout handler
        document.getElementById('logoutBtn').addEventListener('click', function() {
            document.getElementById('resultSection').classList.remove('active');
            document.getElementById('loginForm').reset();
            showAlert('loginAlert', 'Anda telah logout', 'success');
        });
        
        // Admin buttons
        document.getElementById('getStudentsBtn').addEventListener('click', async function() {
            try {
                const response = await fetch(API_BASE_URL + '/api/students');
                const data = await response.json();
                
                if (data.success) {
                    const studentsList = data.students.map(s => 
                        \`<div style="padding: 10px; border-bottom: 1px solid #ddd;">
                            <strong>\${s.nisn}</strong> - \${s.name} (Lahir: \${s.birthdate})
                        </div>\`
                    ).join('');
                    
                    document.getElementById('adminResult').innerHTML = \`
                        <div class="alert alert-success">
                            <strong>\${data.count} Siswa Terdaftar:</strong>
                            <div style="max-height: 200px; overflow-y: auto; margin-top: 10px;">
                                \${studentsList}
                            </div>
                        </div>
                    \`;
                }
            } catch (error) {
                document.getElementById('adminResult').innerHTML = \`
                    <div class="alert alert-error">Error: \${error.message}</div>
                \`;
            }
        });
        
        document.getElementById('resetDemoBtn').addEventListener('click', async function() {
            if (confirm('Reset data demo? Data lama akan diganti.')) {
                try {
                    const response = await fetch(API_BASE_URL + '/api/reset-demo', {
                        method: 'POST'
                    });
                    const data = await response.json();
                    
                    if (data.success) {
                        document.getElementById('adminResult').innerHTML = \`
                            <div class="alert alert-success">
                                \${data.message}<br>
                                <strong>Akun Demo:</strong><br>
                                NISN: \${data.demo_account.nisn}<br>
                                Tanggal Lahir: \${data.demo_account.birthdate}<br>
                                Password: \${data.demo_account.password}
                            </div>
                        \`;
                    }
                } catch (error) {
                    document.getElementById('adminResult').innerHTML = \`
                        <div class="alert alert-error">Error: \${error.message}</div>
                    \`;
                }
            }
        });
        
        // Helper functions
        function showAlert(elementId, message, type) {
            const alertEl = document.getElementById(elementId);
            alertEl.textContent = message;
            alertEl.className = \`alert alert-\${type}\`;
            alertEl.style.display = 'block';
            setTimeout(() => alertEl.style.display = 'none', 5000);
        }
        
        function displayStudentResults(student) {
            // Update student info
            document.getElementById('studentInfo').innerHTML = \`
                <h3>\${student.name}</h3>
                <p><strong>NISN:</strong> \${student.nisn}</p>
                <p><strong>Tempat, Tanggal Lahir:</strong> \${student.place_of_birth}, \${formatDate(student.birthdate)}</p>
                <p><strong>Nomor Peserta:</strong> \${student.test_number}</p>
                <p><strong>Tanggal Tes:</strong> \${student.test_date}</p>
            \`;
            
            // Load results
            loadStudentResults(student.nisn);
            
            // Show result section
            document.getElementById('resultSection').classList.add('active');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
        
        async function loadStudentResults(nisn) {
            try {
                const response = await fetch(\`\${API_BASE_URL}/api/results?nisn=\${nisn}\`);
                const data = await response.json();
                
                if (data.success) {
                    const results = data.results;
                    
                    // Fill main subjects table
                    const mainTable = document.querySelector('#mainSubjectsTable tbody');
                    mainTable.innerHTML = results.main_subjects.map(subject => \`
                        <tr>
                            <td>\${subject.no}</td>
                            <td style="text-align: left;">\${subject.subject}</td>
                            <td style="text-align: center;">\${subject.score}</td>
                            <td style="text-align: center;">\${subject.category}</td>
                        </tr>
                    \`).join('');
                    
                    // Fill elective subjects table
                    const electiveTable = document.querySelector('#electiveSubjectsTable tbody');
                    electiveTable.innerHTML = results.elective_subjects.map(subject => \`
                        <tr>
                            <td>\${subject.no}</td>
                            <td style="text-align: left;">\${subject.subject}</td>
                            <td style="text-align: center;">\${subject.score}</td>
                            <td style="text-align: center;">\${subject.category}</td>
                        </tr>
                    \`).join('');
                }
            } catch (error) {
                console.error('Error loading results:', error);
            }
        }
        
        function formatDate(dateStr) {
            const [day, month, year] = dateStr.split('-');
            const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 
                           'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
            return \`\${day} \${months[parseInt(month)-1]} \${year}\`;
        }
        
        // Initialize demo data
        window.addEventListener('load', async function() {
            try {
                await fetch(API_BASE_URL + '/api/reset-demo', { method: 'POST' });
                console.log('Demo data initialized');
            } catch (error) {
                console.log('Using existing data');
            }
        });
    </script>
</body>
</html>`;
  
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html;charset=UTF-8',
    },
  });
}