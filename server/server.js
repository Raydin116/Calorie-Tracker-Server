const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const https = require('https');

const app = express();
const port = process.env.PORT || 3000;

// Fix CORS configuration with fallback for environment variable
let domainWhiteList = ['http://localhost:5173', 'http://localhost:3000', 'https://calorie-tracker-psi-flame.vercel.app'];
try {
  if (process.env.DOMAIN_WHITELIST) {
    const parsed = JSON.parse(process.env.DOMAIN_WHITELIST);
    if (Array.isArray(parsed)) {
      domainWhiteList = parsed;
    }
  }
} catch (error) {
  console.error('Error parsing DOMAIN_WHITELIST:', error.message);
}
console.log('Allowed origins:', domainWhiteList);

// Configure CORS
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || domainWhiteList.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
};

app.use(cors(corsOptions));

// إضافة تسجيل الأحداث لمعرفة ما يحدث
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// إعداد وسيط مخصص للتعامل مع API
app.use('/api', async (req, res) => {
  try {
    // توليد URL الهدف
    const targetPath = req.url.replace(/^\/api/, '');
    const targetUrl = `https://calorie-tracker-server-production.up.railway.app${targetPath}`;
    console.log(`Proxying ${req.method} request to: ${targetUrl}`);
    
    // استخدام مكتبة http/https الأصلية لتجاوز المشاكل
    const httpLib = targetUrl.startsWith('https') ? https : http;
    
    // جمع البيانات من الطلب إذا كان هناك body
    let requestBody = null;
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      requestBody = await new Promise((resolve) => {
        let data = '';
        req.on('data', chunk => {
          data += chunk;
        });
        req.on('end', () => {
          resolve(data);
        });
      });
    }
    
    // خيارات الطلب باستخدام نطاق مصرح به (localhost:3000 الذي يبدو أنه في القائمة البيضاء)
    const options = {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Origin': 'http://localhost:3000', // استخدام نطاق مصرح به
        'Host': 'calorie-tracker-server-production.up.railway.app'
      }
    };
    
    // إضافة محتوى الطلب إذا كان موجوداً
    if (requestBody) {
      options.headers['Content-Length'] = Buffer.byteLength(requestBody);
    }
    
    // إرسال الطلب
    const proxyReq = httpLib.request(targetUrl, options, (proxyRes) => {
      // نسخ الترويسات من الرد
      res.statusCode = proxyRes.statusCode;
      for (const [key, value] of Object.entries(proxyRes.headers)) {
        if (key !== 'transfer-encoding') { // تجنب تعارض الترويسات
          res.setHeader(key, value);
        }
      }
      
      // جمع البيانات من الرد
      let responseBody = '';
      proxyRes.on('data', (chunk) => {
        responseBody += chunk;
      });
      
      // عند اكتمال الرد، إرسال البيانات للعميل
      proxyRes.on('end', () => {
        console.log(`Response status: ${proxyRes.statusCode}`);
        res.end(responseBody);
      });
    });
    
    // معالجة الأخطاء
    proxyReq.on('error', (error) => {
      console.error('Proxy Error:', error);
      res.status(500).json({
        error: 'Proxy error',
        message: error.message,
        details: 'حدث خطأ أثناء محاولة الاتصال بالخادم. قد يكون الخادم غير متاح أو يرفض الاتصال.'
      });
    });
    
    // إرسال البيانات مع الطلب إذا كانت موجودة
    if (requestBody) {
      proxyReq.write(requestBody);
    }
    
    // إنهاء الطلب
    proxyReq.end();
    
  } catch (error) {
    console.error('Proxy Error:', error);
    res.status(500).json({
      error: 'Proxy error',
      message: error.message,
      details: 'حدث خطأ أثناء محاولة الاتصال بالخادم. قد يكون الخادم غير متاح أو يرفض الاتصال.'
    });
  }
});

// خدمة الملفات الثابتة من مجلد dist بعد البناء
app.use(express.static(path.join(__dirname, 'dist')));

// توجيه جميع الطلبات الأخرى إلى التطبيق الرئيسي
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log(`Access your app at http://localhost:${port}`);
}); 
