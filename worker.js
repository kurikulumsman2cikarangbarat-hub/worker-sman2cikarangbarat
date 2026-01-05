// worker.js - Sistem Lengkap TKA SMAN 2 Cikarang Barat
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
    
    // Handle OPTIONS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }
    
    // Routing utama
    if (path === '/api/login' && request.method === 'POST') {
      return handleLogin(request, env);
    } else if (path === '/api/upload-tka' && request.method === 'POST') {
      return handleUploadTKA(request, env);
    } else if (path === '/api/upload-tka-csv' && request.method === 'POST') {
      return handleUploadCSV(request, env);
    } else if (path === '/api/get-student' && request.method === 'GET') {
      return handleGetStudent(request, env);
    } else if (path === '/api/ranking' && request.method === 'GET') {
      return handleGetRanking(request, env);
    } else if (path === '/api/stats' && request.method === 'GET') {
      return handleGetStats(request, env);
    } else if (path === '/api/reset-demo' && request.method === 'POST') {
      return handleResetDemo(request, env);
    } else if (path === '/api/bulk-upload' && request.method === 'POST') {
      return handleBulkUpload(request, env);
    } else if (path === '/api/export-data' && request.method === 'GET') {
      return handleExportData(request, env);
    }
    
    // Serve frontend
    if (path === '/' || path === '/index.html' || path === '/upload.html') {
      return serveFrontend(path);
    }
    
    // API lama untuk kompatibilitas
    if (path === '/api/students' && request.method === 'GET') {
      return handleGetAllStudents(request, env);
    } else if (path.startsWith('/api/student/') && request.method === 'GET') {
      return handleGetStudentOld(request, env, path);
    } else if (path === '/api/results' && request.method === 'GET') {
      return handleGetResultsOld(request, env);
    }
    
    return jsonResponse({ error: 'Not Found' }, 404);
  },
};

// ==================== HANDLERS BARU UNTUK DATA TKA ASLI ====================

// Handler untuk upload data TKA (JSON)
async function handleUploadTKA(request, env) {
  try {
    const rows = await request.json();
    const results = [];
    
    for (const row of rows) {
      try {
        const result = await saveTKAStudent(env, row);
        results.push({ success: true, ...result });
      } catch (error) {
        results.push({ success: false, error: error.message, row });
      }
    }
    
    return jsonResponse({
      success: true,
      message: `✅ ${results.filter(r => r.success).length} dari ${rows.length} data berhasil diupload`,
      results: results.slice(0, 20) // Batasi output
    });
    
  } catch (error) {
    return jsonResponse({ error: error.message }, 500);
  }
}

// Handler untuk upload CSV/TSV
async function handleUploadCSV(request, env) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const delimiter = formData.get('delimiter') || '\t';
    const hasHeader = formData.get('hasHeader') !== 'false';
    
    if (!file) {
      return jsonResponse({ error: 'File tidak ditemukan' }, 400);
    }
    
    const text = await file.text();
    const rows = parseDelimitedText(text, delimiter, hasHeader);
    
    const results = [];
    let success = 0, errors = 0;
    
    for (const row of rows) {
      try {
        await saveTKAStudent(env, row);
        results.push({ success: true, nisn: row.nisn, nama: row.nama });
        success++;
      } catch (error) {
        results.push({ success: false, error: error.message, row });
        errors++;
      }
    }
    
    return jsonResponse({
      success: true,
      summary: {
        total: rows.length,
        success,
        errors,
        success_rate: ((success / rows.length) * 100).toFixed(2) + '%'
      },
      results: results.slice(0, 10)
    });
    
  } catch (error) {
    return jsonResponse({ error: error.message }, 500);
  }
}

// Parser untuk teks delimited
function parseDelimitedText(text, delimiter, hasHeader = true) {
  const lines = text.split('\n').filter(line => line.trim() !== '');
  const rows = [];
  
  let startIndex = hasHeader ? 1 : 0;
  
  for (let i = startIndex; i < lines.length; i++) {
    const columns = lines[i].split(delimiter).map(col => col.trim());
    
    if (columns.length >= 17) { // Sesuai dengan 17 kolom TKA
      const row = {
        no_ujian: columns[0] || '',
        nama: columns[1] || '',
        ttl: columns[2] || '',
        n_bin: columns[3] || '0',
        n_mtk: columns[4] || '0',
        n_big: columns[5] || '0',
        n_mp1: columns[6] || '0',
        n_mp2: columns[7] || '0',
        k_m1: columns[8] || '',
        k_m2: columns[9] || '',
        tl: columns[10] || '',
        nisn: columns[11] || '',
        k_bin: columns[12] || '',
        k_mtk: columns[13] || '',
        k_big: columns[14] || '',
        k_mp1: columns[15] || '',
        k_mp2: columns[16] || ''
      };
      
      rows.push(row);
    }
  }
  
  return rows;
}

// Fungsi simpan data siswa TKA
async function saveTKAStudent(env, data) {
  // Parse no_ujian (format: "0001-8 0086565132")
  const noUjianFull = data.no_ujian.trim();
  const parts = noUjianFull.split(' ');
  const nomorUjian = parts[0] || '';
  const nisn = data.nisn || (parts.length > 1 ? parts[1] : '');
  
  if (!nisn || nisn.length !== 10) {
    throw new Error(`NISN tidak valid: ${nisn}`);
  }
  
  // KEY: Format untuk TKA
  const key = `tka:${nisn}`;
  
  // Helper: konversi koma ke dot
  function parseNumber(str) {
    if (!str) return 0;
    return parseFloat(str.toString().replace(',', '.').trim()) || 0;
  }
  
  // Helper: parse TTL
  function parseTTL(ttlStr) {
    if (!ttlStr) return { tempat: '', tanggal: '' };
    const parts = ttlStr.split(',');
    return {
      tempat: parts[0] ? parts[0].trim() : '',
      tanggal: parts.length > 1 ? parts[1].trim() : ''
    };
  }
  
  const ttl = parseTTL(data.ttl);
  
  // VALUE: Struktur lengkap TKA
  const value = {
    // Identitas
    nisn: nisn,
    nama: data.nama.trim().toUpperCase(),
    ttl: data.ttl.trim(),
    tempat_lahir: ttl.tempat,
    tanggal_lahir: ttl.tanggal,
    
    // Info ujian
    nomor_ujian: nomorUjian,
    no_ujian_full: noUjianFull,
    
    // Nilai mata pelajaran
    nilai: {
      bahasa_indonesia: parseNumber(data.n_bin),
      matematika: parseNumber(data.n_mtk),
      bahasa_inggris: parseNumber(data.n_big),
      mapel_pilihan_1: parseNumber(data.n_mp1),
      mapel_pilihan_2: parseNumber(data.n_mp2)
    },
    
    // Nama mata pelajaran pilihan
    mapel_pilihan: {
      nama_1: data.k_m1.trim(),
      nama_2: data.k_m2.trim()
    },
    
    // Kategori nilai
    kategori: {
      bahasa_indonesia: data.k_bin.trim(),
      matematika: data.k_mtk.trim(),
      bahasa_inggris: data.k_big.trim(),
      mapel_pilihan_1: data.k_mp1.trim(),
      mapel_pilihan_2: data.k_mp2.trim()
    },
    
    // Status
    status_lulus: data.tl && data.tl.toLowerCase().includes('lulus') ? 'LULUS' : 'TIDAK LULUS',
    tanggal_lahir_alternatif: data.tl.trim(),
    
    // Statistik
    statistik: {
      total: (
        parseNumber(data.n_bin) +
        parseNumber(data.n_mtk) +
        parseNumber(data.n_big) +
        parseNumber(data.n_mp1) +
        parseNumber(data.n_mp2)
      ).toFixed(2),
      rata_rata: (
        (parseNumber(data.n_bin) +
         parseNumber(data.n_mtk) +
         parseNumber(data.n_big) +
         parseNumber(data.n_mp1) +
         parseNumber(data.n_mp2)) / 5
      ).toFixed(2)
    },
    
    // Metadata
    metadata: {
      tanggal_upload: new Date().toISOString(),
      sekolah: 'SMAN 2 CIKARANG BARAT',
      tahun_ajaran: '2024/2025',
      created_by: 'SYSTEM_TKA'
    }
  };
  
  // Simpan ke KV
  await env.TKA_DB.put(key, JSON.stringify(value));
  
  // Index untuk pencarian
  await env.TKA_DB.put(`index:nisn:${nisn}`, key);
  await env.TKA_DB.put(`index:nama:${data.nama.toLowerCase().replace(/\s+/g, '_')}`, key);
  await env.TKA_DB.put(`index:no_ujian:${nomorUjian}`, key);
  
  return {
    key: key,
    nisn: nisn,
    nama: data.nama,
    status: 'OK'
  };
}

// Handler untuk get student by NISN atau nama
async function handleGetStudent(request, env) {
  const url = new URL(request.url);
  const nisn = url.searchParams.get('nisn');
  const nama = url.searchParams.get('nama');
  const noUjian = url.searchParams.get('no_ujian');
  
  let key;
  if (nisn) {
    key = await env.TKA_DB.get(`index:nisn:${nisn}`);
  } else if (nama) {
    const searchKey = nama.toLowerCase().replace(/\s+/g, '_');
    key = await env.TKA_DB.get(`index:nama:${searchKey}`);
  } else if (noUjian) {
    key = await env.TKA_DB.get(`index:no_ujian:${noUjian}`);
  }
  
  if (!key) {
    return jsonResponse({ error: 'Data tidak ditemukan' }, 404);
  }
  
  const data = await env.TKA_DB.get(key, 'json');
  
  if (!data) {
    return jsonResponse({ error: 'Data tidak ditemukan' }, 404);
  }
  
  return jsonResponse({
    success: true,
    data: data
  });
}

// Handler untuk ranking
async function handleGetRanking(request, env) {
  const allKeys = await env.TKA_DB.list({ prefix: 'tka:' });
  
  const students = [];
  
  for (const key of allKeys.keys) {
    const data = await env.TKA_DB.get(key.name, 'json');
    if (data) {
      students.push({
        nisn: data.nisn,
        nama: data.nama,
        rata_rata: parseFloat(data.statistik.rata_rata),
        total: parseFloat(data.statistik.total),
        status: data.status_lulus
      });
    }
  }
  
  // Urutkan berdasarkan rata-rata
  students.sort((a, b) => b.rata_rata - a.rata_rata);
  
  // Tambah ranking
  students.forEach((student, index) => {
    student.ranking = index + 1;
  });
  
  return jsonResponse({
    success: true,
    count: students.length,
    students: students.slice(0, 100) // Batasi 100 terbaik
  });
}

// Handler untuk statistik
async function handleGetStats(request, env) {
  const allKeys = await env.TKA_DB.list({ prefix: 'tka:' });
  
  let total = 0;
  let lulus = 0;
  const nilaiMapel = {
    bin: [], mtk: [], big: [], mp1: [], mp2: []
  };
  
  for (const key of allKeys.keys) {
    const data = await env.TKA_DB.get(key.name, 'json');
    if (data) {
      total++;
      if (data.status_lulus === 'LULUS') lulus++;
      
      if (data.nilai) {
        nilaiMapel.bin.push(data.nilai.bahasa_indonesia);
        nilaiMapel.mtk.push(data.nilai.matematika);
        nilaiMapel.big.push(data.nilai.bahasa_inggris);
        nilaiMapel.mp1.push(data.nilai.mapel_pilihan_1);
        nilaiMapel.mp2.push(data.nilai.mapel_pilihan_2);
      }
    }
  }
  
  // Hitung rata-rata per mapel
  const avgMapel = {};
  for (const [mapel, nilai] of Object.entries(nilaiMapel)) {
    if (nilai.length > 0) {
      const sum = nilai.reduce((a, b) => a + b, 0);
      avgMapel[mapel] = (sum / nilai.length).toFixed(2);
    }
  }
  
  return jsonResponse({
    success: true,
    statistik: {
      total_siswa: total,
      lulus: lulus,
      tidak_lulus: total - lulus,
      persentase_lulus: total > 0 ? ((lulus / total) * 100).toFixed(2) : 0,
      rata_rata_mapel: avgMapel
    }
  });
}

// Handler untuk bulk upload langsung (tanpa file)
async function handleBulkUpload(request, env) {
  try {
    const { data, action = 'append' } = await request.json();
    
    if (action === 'replace') {
      // Hapus semua data lama
      const allKeys = await env.TKA_DB.list({ prefix: 'tka:' });
      for (const key of allKeys.keys) {
        await env.TKA_DB.delete(key.name);
      }
    }
    
    const results = [];
    for (const row of data) {
      try {
        const result = await saveTKAStudent(env, row);
        results.push({ success: true, ...result });
      } catch (error) {
        results.push({ success: false, error: error.message });
      }
    }
    
    return jsonResponse({
      success: true,
      message: `✅ ${results.filter(r => r.success).length} data berhasil diproses`,
      results: results.slice(0, 10)
    });
    
  } catch (error) {
    return jsonResponse({ error: error.message }, 500);
  }
}

// Handler untuk export data
async function handleExportData(request, env) {
  const allKeys = await env.TKA_DB.list({ prefix: 'tka:' });
  
  const data = [];
  for (const key of allKeys.keys) {
    const item = await env.TKA_DB.get(key.name, 'json');
    if (item) {
      data.push(item);
    }
  }
  
  // Format CSV untuk download
  const csvHeaders = [
    'NISN', 'Nama', 'TTL', 'No_Ujian', 
    'N_BIN', 'N_MTK', 'N_BIG', 'N_MP1', 'N_MP2',
    'K_BIN', 'K_MTK', 'K_BIG', 'K_MP1', 'K_MP2',
    'Status_Lulus', 'Rata_Rata'
  ];
  
  const csvRows = data.map(item => [
    item.nisn,
    `"${item.nama}"`,
    `"${item.ttl}"`,
    item.no_ujian_full,
    item.nilai.bahasa_indonesia.toString().replace('.', ','),
    item.nilai.matematika.toString().replace('.', ','),
    item.nilai.bahasa_inggris.toString().replace('.', ','),
    item.nilai.mapel_pilihan_1.toString().replace('.', ','),
    item.nilai.mapel_pilihan_2.toString().replace('.', ','),
    item.kategori.bahasa_indonesia,
    item.kategori.matematika,
    item.kategori.bahasa_inggris,
    item.kategori.mapel_pilihan_1,
    item.kategori.mapel_pilihan_2,
    item.status_lulus,
    item.statistik.rata_rata.toString().replace('.', ',')
  ].join(';'));
  
  const csvContent = [csvHeaders.join(';'), ...csvRows].join('\n');
  
  return new Response(csvContent, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="data-tka-${new Date().toISOString().split('T')[0]}.csv"`
    }
  });
}

// ==================== HANDLERS LAMA (UNTUK KOMPATIBILITAS) ====================

async function handleLogin(request, env) {
  try {
    const { nisn, birthdate } = await request.json();
    
    // Cari di data TKA baru
    const key = `tka:${nisn}`;
    const studentData = await env.TKA_DB.get(key, 'json');
    
    if (!studentData) {
      return jsonResponse({ error: 'NISN tidak ditemukan' }, 404);
    }
    
    // Verifikasi tanggal lahir (format: "27 April 2008")
    const ttlParts = studentData.ttl.split(',');
    const tanggalLahir = ttlParts.length > 1 ? ttlParts[1].trim() : '';
    
    // Konversi format tanggal
    const months = {
      'januari': '01', 'februari': '02', 'maret': '03', 'april': '04',
      'mei': '05', 'juni': '06', 'juli': '07', 'agustus': '08',
      'september': '09', 'oktober': '10', 'november': '11', 'desember': '12'
    };
    
    const dateParts = tanggalLahir.toLowerCase().split(' ');
    if (dateParts.length === 3) {
      const day = dateParts[0].padStart(2, '0');
      const month = months[dateParts[1]] || '01';
      const year = dateParts[2];
      const formattedDate = `${day}-${month}-${year}`;
      
      if (formattedDate !== birthdate) {
        return jsonResponse({ error: 'Tanggal lahir tidak sesuai' }, 401);
      }
    }
    
    return jsonResponse({
      success: true,
      message: 'Login berhasil',
      student: {
        nisn: studentData.nisn,
        name: studentData.nama,
        ttl: studentData.ttl,
        test_results: studentData
      }
    });
    
  } catch (error) {
    return jsonResponse({ error: error.message }, 500);
  }
}

async function handleGetAllStudents(request, env) {
  const allKeys = await env.TKA_DB.list({ prefix: 'tka:' });
  
  const students = [];
  for (const key of allKeys.keys) {
    const data = await env.TKA_DB.get(key.name, 'json');
    if (data) {
      students.push({
        nisn: data.nisn,
        name: data.nama,
        ttl: data.ttl,
        status: data.status_lulus,
        rata_rata: data.statistik.rata_rata
      });
    }
  }
  
  return jsonResponse({
    success: true,
    count: students.length,
    students
  });
}

// ==================== HELPER FUNCTIONS ====================

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

async function serveFrontend(path) {
  let html;
  
  if (path === '/upload.html') {
    // Upload page khusus
    html = `<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Upload Data TKA - SMAN 2 Cikarang Barat</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial; background: #f5f5f5; padding: 20px; }
        .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        h1 { color: #2c3e50; margin-bottom: 20px; }
        .upload-area { border: 3px dashed #3498db; padding: 40px; text-align: center; border-radius: 10px; margin: 20px 0; background: #f8f9fa; }
        .upload-area.dragover { background: #e3f2fd; }
        button { background: #3498db; color: white; border: none; padding: 12px 24px; border-radius: 5px; cursor: pointer; font-size: 16px; margin: 10px; }
        button:hover { background: #2980b9; }
        .result { margin-top: 20px; padding: 15px; border-radius: 5px; }
        .success { background: #d4edda; color: #155724; }
        .error { background: #f8d7da; color: #721c24; }
        textarea { width: 100%; height: 300px; font-family: monospace; padding: 10px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>📤 Upload Data TKA SMAN 2 Cikarang Barat</h1>
        
        <div class="upload-area" id="uploadArea">
            <h3>Seret file .txt/.tsv ke sini</h3>
            <p>Atau klik untuk memilih file</p>
            <input type="file" id="fileInput" accept=".txt,.tsv,.csv" style="display: none;">
            <button onclick="document.getElementById('fileInput').click()">Pilih File</button>
        </div>
        
        <div>
            <h3>Atau paste data langsung:</h3>
            <textarea id="dataInput" placeholder="Tempel data tab-delimited di sini..."></textarea>
            <button onclick="uploadPaste()">Upload Data</button>
        </div>
        
        <div id="result" class="result"></div>
        
        <div style="margin-top: 30px; padding: 20px; background: #f8f9fa; border-radius: 5px;">
            <h4>📋 Format Data:</h4>
            <pre style="font-size: 12px; overflow-x: auto;">
No._ujian	nama	ttl	n_bin	n_mtk	n_big	n_mp1	n_mp2	k_m1	k_m2	tl	nisn	k_bin	k_mtk	k_big	k_mp1	k_mp2
0001-8 0086565132	DEWI MUSTIKA HADIATUS SHOLIKHA	BEKASI, 27 April 2008	66,37	37,56	22,65	80,15	43,22	Bahasa Indonesia Tingkat Lanjut	Ekonomi	27 April 2008	0086565132	Istimewa	Memadai	Memadai	Baik	Baik
            </pre>
        </div>
    </div>
    
    <script>
        const workerUrl = 'https://sman2cikarangbarat.kurikulum-sman2cikarangbarat.workers.dev';
        
        // Drag and drop
        const uploadArea = document.getElementById('uploadArea');
        const fileInput = document.getElementById('fileInput');
        
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });
        
        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('dragover');
        });
        
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            if (e.dataTransfer.files.length) {
                fileInput.files = e.dataTransfer.files;
                uploadFile();
            }
        });
        
        fileInput.addEventListener('change', uploadFile);
        
        async function uploadFile() {
            const file = fileInput.files[0];
            if (!file) return;
            
            const formData = new FormData();
            formData.append('file', file);
            formData.append('delimiter', '\\t');
            formData.append('hasHeader', 'true');
            
            try {
                const response = await fetch(workerUrl + '/api/upload-tka-csv', {
                    method: 'POST',
                    body: formData
                });
                
                const result = await response.json();
                showResult(result);
            } catch (error) {
                showResult({ success: false, error: error.message });
            }
        }
        
        async function uploadPaste() {
            const dataText = document.getElementById('dataInput').value;
            const lines = dataText.split('\\n').filter(line => line.trim());
            
            if (lines.length < 2) {
                showResult({ success: false, error: 'Data tidak valid' });
                return;
            }
            
            const headers = lines[0].split('\\t');
            const rows = [];
            
            for (let i = 1; i < lines.length; i++) {
                const columns = lines[i].split('\\t');
                const row = {};
                headers.forEach((header, index) => {
                    row[header] = columns[index] || '';
                });
                rows.push(row);
            }
            
            try {
                const response = await fetch(workerUrl + '/api/bulk-upload', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ data: rows, action: 'append' })
                });
                
                const result = await response.json();
                showResult(result);
            } catch (error) {
                showResult({ success: false, error: error.message });
            }
        }
        
        function showResult(result) {
            const resultDiv = document.getElementById('result');
            
            if (result.success) {
                resultDiv.className = 'result success';
                resultDiv.innerHTML = \`
                    <h3>✅ Upload Berhasil!</h3>
                    <p>\${result.message}</p>
                    <p>Total data: \${result.summary?.total || 'N/A'}</p>
                    <p>Berhasil: \${result.summary?.success || 'N/A'}</p>
                    <p>Error: \${result.summary?.errors || 'N/A'}</p>
                \`;
            } else {
                resultDiv.className = 'result error';
                resultDiv.innerHTML = \`
                    <h3>❌ Upload Gagal</h3>
                    <p>\${result.error}</p>
                \`;
            }
        }
        
        // Load contoh data
        document.getElementById('dataInput').value = \`No._ujian\\tnama\\tttl\\tn_bin\\tn_mtk\\tn_big\\tn_mp1\\tn_mp2\\tk_m1\\tk_m2\\ttl\\tnisn\\tk_bin\\tk_mtk\\tk_big\\tk_mp1\\tk_mp2
0001-8 0086565132\\tDEWI MUSTIKA HADIATUS SHOLIKHA\\tBEKASI, 27 April 2008\\t66,37\\t37,56\\t22,65\\t80,15\\t43,22\\tBahasa Indonesia Tingkat Lanjut\\tEkonomi\\t27 April 2008\\t0086565132\\tIstimewa\\tMemadai\\tMemadai\\tBaik\\tBaik
0002-7 0071544862\\tWulan Chantika\\tBekasi, 30 Mei 2007\\t59,09\\t26,31\\t18,55\\t81,67\\t60,25\\tBahasa Indonesia Tingkat Lanjut\\tSosiologi\\t30 Mei 2007\\t0071544862\\tIstimewa\\tKurang\\tKurang\\tBaik\\tMemadai\`;
    </script>
</body>
</html>`;
  } else {
    // Main page (sama dengan yang ada)
    html = `<!DOCTYPE html>
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
        .menu { display: flex; gap: 10px; margin-bottom: 20px; }
        .menu button { width: auto; }
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
            <p>Data Hasil Tes Kompetensi Akademik</p>
        </div>
        
        <div class="content">
            <div class="menu">
                <button class="btn" onclick="showSection('login')">🔐 Login Siswa</button>
                <button class="btn btn-success" onclick="showSection('upload')">📤 Upload Data</button>
                <button class="btn" onclick="showSection('ranking')">🏆 Ranking</button>
                <button class="btn" onclick="showSection('stats')">📊 Statistik</button>
            </div>
            
            <!-- Login Section -->
            <div class="section" id="loginSection">
                <h2>🔐 Login Siswa</h2>
                <form id="loginForm">
                    <div class="form-group">
                        <label>NISN (10 digit)</label>
                        <input type="text" id="loginNISN" maxlength="10" placeholder="0086565132" required>
                    </div>
                    <div class="form-group">
                        <label>Tanggal Lahir (DD-MM-YYYY)</label>
                        <input type="text" id="loginBirthdate" placeholder="27-04-2008" required>
                    </div>
                    <button type="submit" class="btn">Masuk</button>
                    <button type="button" class="btn btn-success" onclick="loginDemo()" style="margin-top: 10px;">
                        Login Demo
                    </button>
                </form>
                <div id="loginAlert" class="alert" style="display: none;"></div>
            </div>
            
            <!-- Upload Section -->
            <div class="section" id="uploadSection" style="display: none;">
                <h2>📤 Upload Data TKA</h2>
                <p>Pergi ke halaman upload untuk mengunggah data dalam jumlah besar:</p>
                <a href="/upload.html" target="_blank">
                    <button class="btn btn-success">Buka Halaman Upload</button>
                </a>
                <p style="margin-top: 20px; color: #666;">
                    Format data harus tab-delimited dengan kolom sesuai contoh.
                    Lihat contoh di halaman upload.
                </p>
            </div>
            
            <!-- Result Section -->
            <div class="section result" id="resultSection" style="display: none;">
                <h2>🎓 Hasil Tes Kompetensi Akademik</h2>
                <div id="studentInfo" class="student-info"></div>
                
                <h3>Nilai Mata Pelajaran</h3>
                <table id="scoresTable">
                    <thead>
                        <tr>
                            <th>Mata Pelajaran</th>
                            <th>Nilai</th>
                            <th>Kategori</th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                </table>
                
                <h3>Statistik</h3>
                <div id="statistics" style="margin: 20px 0;"></div>
                
                <button class="btn btn-danger" onclick="logout()">Keluar</button>
            </div>
            
            <!-- Ranking Section -->
            <div class="section" id="rankingSection" style="display: none;">
                <h2>🏆 Ranking Siswa</h2>
                <button class="btn" onclick="loadRanking()">Muat Ranking</button>
                <div id="rankingResults" style="margin-top: 20px;"></div>
            </div>
            
            <!-- Stats Section -->
            <div class="section" id="statsSection" style="display: none;">
                <h2>📊 Statistik Sekolah</h2>
                <button class="btn" onclick="loadStats()">Muat Statistik</button>
                <div id="statsResults" style="margin-top: 20px;"></div>
            </div>
            
            <!-- Admin Panel -->
            <div class="section admin-panel">
                <h2>⚙️ Admin Panel</h2>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                    <button class="btn" onclick="getAllStudents()">Daftar Siswa</button>
                    <button class="btn btn-success" onclick="resetDemo()">Reset Data Demo</button>
                    <button class="btn" onclick="exportData()">Export Data</button>
                </div>
                <div id="adminResult" style="margin-top: 20px;"></div>
                
                <div class="api-info">
                    <h4>📡 API Endpoints:</h4>
                    <p>POST /api/login - Login siswa</p>
                    <p>POST /api/upload-tka - Upload data JSON</p>
                    <p>POST /api/upload-tka-csv - Upload file CSV/TSV</p>
                    <p>GET /api/get-student?nisn=... - Cari siswa</p>
                    <p>GET /api/ranking - Ranking siswa</p>
                    <p>GET /api/stats - Statistik sekolah</p>
                    <p>GET /api/export-data - Download data CSV</p>
                </div>
            </div>
        </div>
    </div>

    <script>
        const workerUrl = 'https://sman2cikarangbarat.kurikulum-sman2cikarangbarat.workers.dev';
        
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
                const response = await fetch(workerUrl + '/api/login', {
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
        function loginDemo() {
            document.getElementById('loginNISN').value = '0086565132';
            document.getElementById('loginBirthdate').value = '27-04-2008';
            document.getElementById('loginForm').dispatchEvent(new Event('submit'));
        }
        
        // Display student results
        function displayStudentResults(student) {
            const testData = student.test_results;
            
            // Student info
            document.getElementById('studentInfo').innerHTML = \`
                <h3>\${testData.nama}</h3>
                <p><strong>NISN:</strong> \${testData.nisn}</p>
                <p><strong>Tempat, Tanggal Lahir:</strong> \${testData.ttl}</p>
                <p><strong>No. Ujian:</strong> \${testData.no_ujian_full}</p>
                <p><strong>Status:</strong> \${testData.status_lulus}</p>
            \`;
            
            // Scores table
            const tableBody = document.querySelector('#scoresTable tbody');
            tableBody.innerHTML = \`
                <tr>
                    <td>Bahasa Indonesia</td>
                    <td>\${testData.nilai.bahasa_indonesia}</td>
                    <td>\${testData.kategori.bahasa_indonesia}</td>
                </tr>
                <tr>
                    <td>Matematika</td>
                    <td>\${testData.nilai.matematika}</td>
                    <td>\${testData.kategori.matematika}</td>
                </tr>
                <tr>
                    <td>Bahasa Inggris</td>
                    <td>\${testData.nilai.bahasa_inggris}</td>
                    <td>\${testData.kategori.bahasa_inggris}</td>
                </tr>
                <tr>
                    <td>\${testData.mapel_pilihan.nama_1}</td>
                    <td>\${testData.nilai.mapel_pilihan_1}</td>
                    <td>\${testData.kategori.mapel_pilihan_1}</td>
                </tr>
                <tr>
                    <td>\${testData.mapel_pilihan.nama_2}</td>
                    <td>\${testData.nilai.mapel_pilihan_2}</td>
                    <td>\${testData.kategori.mapel_pilihan_2}</td>
                </tr>
            \`;
            
            // Statistics
            document.getElementById('statistics').innerHTML = \`
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px;">
                    <div style="background: #e3f2fd; padding: 10px; border-radius: 5px; text-align: center;">
                        <div style="font-size: 24px; font-weight: bold;">\${testData.statistik.total}</div>
                        <div style="font-size: 12px;">Total Nilai</div>
                    </div>
                    <div style="background: #e8f5e9; padding: 10px; border-radius: 5px; text-align: center;">
                        <div style="font-size: 24px; font-weight: bold;">\${testData.statistik.rata_rata}</div>
                        <div style="font-size: 12px;">Rata-rata</div>
                    </div>
                </div>
            \`;
            
            // Show result section
            showSection('result');
        }
        
        // Logout
        function logout() {
            showSection('login');
            document.getElementById('loginForm').reset();
        }
        
        // Load ranking
        async function loadRanking() {
            try {
                const response = await fetch(workerUrl + '/api/ranking');
                const data = await response.json();
                
                if (data.success) {
                    let html = \`<h3>Top \${data.students.length} Siswa</h3>\`;
                    html += '<table><thead><tr><th>Rank</th><th>Nama</th><th>NISN</th><th>Rata-rata</th><th>Status</th></tr></thead><tbody>';
                    
                    data.students.forEach(student => {
                        html += \`<tr>
                            <td>\${student.ranking}</td>
                            <td>\${student.nama}</td>
                            <td>\${student.nisn}</td>
                            <td>\${student.rata_rata}</td>
                            <td>\${student.status}</td>
                        </tr>\`;
                    });
                    
                    html += '</tbody></table>';
                    document.getElementById('rankingResults').innerHTML = html;
                }
            } catch (error) {
                document.getElementById('rankingResults').innerHTML = \`<div class="alert alert-error">Error: \${error.message}</div>\`;
            }
        }
        
        // Load stats
        async function loadStats() {
            try {
                const response = await fetch(workerUrl + '/api/stats');
                const data = await response.json();
                
                if (data.success) {
                    const stats = data.statistik;
                    let html = \`
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px;">
                            <div style="background: #e3f2fd; padding: 15px; border-radius: 8px; text-align: center;">
                                <div style="font-size: 32px; font-weight: bold;">\${stats.total_siswa}</div>
                                <div>Total Siswa</div>
                            </div>
                            <div style="background: #e8f5e9; padding: 15px; border-radius: 8px; text-align: center;">
                                <div style="font-size: 32px; font-weight: bold;">\${stats.lulus}</div>
                                <div>Lulus</div>
                            </div>
                            <div style="background: #ffebee; padding: 15px; border-radius: 8px; text-align: center;">
                                <div style="font-size: 32px; font-weight: bold;">\${stats.tidak_lulus}</div>
                                <div>Tidak Lulus</div>
                            </div>
                            <div style="background: #fff3e0; padding: 15px; border-radius: 8px; text-align: center;">
                                <div style="font-size: 32px; font-weight: bold;">\${stats.persentase_lulus}%</div>
                                <div>Persentase Lulus</div>
                            </div>
                        </div>
                        <h4 style="margin-top: 20px;">Rata-rata per Mata Pelajaran:</h4>
                        <ul>\`;
                    
                    for (const [mapel, nilai] of Object.entries(stats.rata_rata_mapel)) {
                        const mapelNames = {
                            'bin': 'Bahasa Indonesia',
                            'mtk': 'Matematika',
                            'big': 'Bahasa Inggris',
                            'mp1': 'Mapel Pilihan 1',
                            'mp2': 'Mapel Pilihan 2'
                        };
                        html += \`<li>\${mapelNames[mapel] || mapel}: \${nilai}</li>\`;
                    }
                    
                    html += '</ul>';
                    document.getElementById('statsResults').innerHTML = html;
                }
            } catch (error) {
                document.getElementById('statsResults').innerHTML = \`<div class="alert alert-error">Error: \${error.message}</div>\`;
            }
        }
        
        // Admin functions
        async function getAllStudents() {
            try {
                const response = await fetch(workerUrl + '/api/students');
                const data = await response.json();
                
                if (data.success) {
                    let html = \`<h3>\${data.count} Siswa Terdaftar</h3>\`;
                    html += '<div style="max-height: 300px; overflow-y: auto;">';
                    
                    data.students.forEach(student => {
                        html += \`<div style="padding: 10px; border-bottom: 1px solid #ddd;">
                            <strong>\${student.nisn}</strong> - \${student.name}
                            <br><small>\${student.ttl} | Rata: \${student.rata_rata}</small>
                        </div>\`;
                    });
                    
                    html += '</div>';
                    document.getElementById('adminResult').innerHTML = html;
                }
            } catch (error) {
                document.getElementById('adminResult').innerHTML = \`<div class="alert alert-error">Error: \${error.message}</div>\`;
            }
        }
        
        async function resetDemo() {
            if (confirm('Reset data demo?')) {
                try {
                    const response = await fetch(workerUrl + '/api/reset-demo', {
                        method: 'POST'
                    });
                    const data = await response.json();
                    
                    if (data.success) {
                        document.getElementById('adminResult').innerHTML = \`
                            <div class="alert alert-success">
                                \${data.message}<br>
                                Akun demo sudah direset.
                            </div>
                        \`;
                    }
                } catch (error) {
                    document.getElementById('adminResult').innerHTML = \`
                        <div class="alert alert-error">Error: \${error.message}</div>
                    \`;
                }
            }
        }
        
        async function exportData() {
            try {
                const response = await fetch(workerUrl + '/api/export-data');
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = \`data-tka-\${new Date().toISOString().split('T')[0]}.csv\`;
                document.body.appendChild(a);
                a.click();
                a.remove();
            } catch (error) {
                document.getElementById('adminResult').innerHTML = \`
                    <div class="alert alert-error">Error: \${error.message}</div>
                \`;
            }
        }
        
        // Helper functions
        function showSection(sectionName) {
            ['login', 'upload', 'result', 'ranking', 'stats'].forEach(section => {
                document.getElementById(section + 'Section').style.display = 'none';
            });
            document.getElementById(sectionName + 'Section').style.display = 'block';
        }
        
        function showAlert(elementId, message, type) {
            const alertEl = document.getElementById(elementId);
            alertEl.textContent = message;
            alertEl.className = \`alert alert-\${type}\`;
            alertEl.style.display = 'block';
            setTimeout(() => alertEl.style.display = 'none', 5000);
        }
        
        // Initialize
        window.addEventListener('load', async function() {
            console.log('TKA System Ready');
            console.log('Worker URL:', workerUrl);
            showSection('login');
            
            // Auto create demo data if needed
            try {
                await fetch(workerUrl + '/api/reset-demo', { method: 'POST' });
            } catch (error) {
                console.log('Using existing data');
            }
        });
    </script>
</body>
</html>`;
  }
  
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html;charset=UTF-8',
    },
  });
}
