const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");

const CONFIG = {
  issuerId: process.env.APPSTORE_ISSUER_ID || "1db48a32-4c79-4050-9825-cc88c70c1706",
  keyId: process.env.APPSTORE_KEY_ID || "5RRN2W8MW4",
  privateKeyPath: process.env.APPSTORE_PRIVATE_KEY_PATH || path.join(__dirname, "..", "..", "medremind-app", "private_artifacts", "ios-signing", "appstore-connect", "AuthKey_5RRN2W8MW4.p8"),
  bundleId: process.env.MONEY_MAKER_BUNDLE_ID || "app.zhuandachian.private",
  bundleName: process.env.MONEY_MAKER_BUNDLE_NAME || "Zhuan Da Qian",
  profileName: process.env.MONEY_MAKER_PROFILE_NAME || "money-maker-appstore-2026",
  appName: process.env.MONEY_MAKER_APP_NAME || "賺大錢",
  sku: process.env.MONEY_MAKER_SKU || "MONEYMAKERPRIVATE2026"
};

function token() {
  const key = fs.readFileSync(CONFIG.privateKeyPath, "utf8");
  return jwt.sign(
    {
      iss: CONFIG.issuerId,
      aud: "appstoreconnect-v1",
      exp: Math.floor(Date.now() / 1000) + 600
    },
    key,
    { algorithm: "ES256", header: { kid: CONFIG.keyId, typ: "JWT" } }
  );
}

async function api(method, endpoint, body) {
  const response = await fetch(`https://api.appstoreconnect.apple.com${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = payload.errors && payload.errors[0];
    const message = error ? `${error.status || response.status} ${error.code || ""} ${error.title || ""} ${error.detail || ""}` : `${response.status}`;
    const err = new Error(message.trim());
    err.status = response.status;
    err.payload = payload;
    throw err;
  }
  return payload;
}

async function findBundleId() {
  const query = encodeURIComponent(`identifier==${CONFIG.bundleId}`);
  const payload = await api("GET", `/v1/bundleIds?filter[identifier]=${query}&limit=1`);
  return payload.data && payload.data[0];
}

async function createBundleId() {
  return api("POST", "/v1/bundleIds", {
    data: {
      type: "bundleIds",
      attributes: {
        identifier: CONFIG.bundleId,
        name: CONFIG.bundleName,
        platform: "IOS"
      }
    }
  }).then((payload) => payload.data);
}

async function pickCertificate() {
  const payload = await api("GET", "/v1/certificates?limit=20");
  const certificates = payload.data || [];
  const cert = certificates.find((item) => item.attributes && item.attributes.certificateType === "DISTRIBUTION") || certificates[0];
  if (!cert) throw new Error("No distribution certificate found");
  return cert;
}

async function findProfile(bundleIdResource) {
  const payload = await api("GET", `/v1/profiles?filter[name]=${encodeURIComponent(CONFIG.profileName)}&limit=10`);
  return (payload.data || []).find((profile) => profile.relationships && profile.relationships.bundleId && profile.relationships.bundleId.data && profile.relationships.bundleId.data.id === bundleIdResource.id) || (payload.data || [])[0];
}

async function createProfile(bundleIdResource, certificate) {
  return api("POST", "/v1/profiles", {
    data: {
      type: "profiles",
      attributes: {
        name: CONFIG.profileName,
        profileType: "IOS_APP_STORE"
      },
      relationships: {
        bundleId: {
          data: { type: "bundleIds", id: bundleIdResource.id }
        },
        certificates: {
          data: [{ type: "certificates", id: certificate.id }]
        }
      }
    }
  }).then((payload) => payload.data);
}

async function findApp() {
  const payload = await api("GET", `/v1/apps?filter[bundleId]=${encodeURIComponent(CONFIG.bundleId)}&limit=1`);
  return payload.data && payload.data[0];
}

async function createApp() {
  return api("POST", "/v1/apps", {
    data: {
      type: "apps",
      attributes: {
        bundleId: CONFIG.bundleId,
        name: CONFIG.appName,
        primaryLocale: "zh-Hant",
        sku: CONFIG.sku,
        platform: "IOS"
      }
    }
  }).then((payload) => payload.data);
}

async function main() {
  const outputDir = path.join(__dirname, "..", "private_artifacts", "ios-signing");
  fs.mkdirSync(outputDir, { recursive: true });

  let bundleIdResource = await findBundleId();
  const created = { bundleId: false, profile: false, app: false };
  if (!bundleIdResource) {
    bundleIdResource = await createBundleId();
    created.bundleId = true;
  }

  const certificate = await pickCertificate();
  let profile = await findProfile(bundleIdResource);
  if (!profile) {
    profile = await createProfile(bundleIdResource, certificate);
    created.profile = true;
  }

  const profilePath = path.join(outputDir, `${CONFIG.profileName}.mobileprovision`);
  const profileBase64Path = `${profilePath}.base64`;
  fs.writeFileSync(profilePath, Buffer.from(profile.attributes.profileContent, "base64"));
  fs.writeFileSync(profileBase64Path, profile.attributes.profileContent);

  let app = await findApp();
  if (!app) {
    try {
      app = await createApp();
      created.app = true;
    } catch (error) {
      app = null;
      console.error(`APP_CREATE_SKIPPED ${error.message}`);
    }
  }

  console.log(JSON.stringify({
    bundleId: CONFIG.bundleId,
    bundleResourceId: bundleIdResource.id,
    profileId: profile.id,
    profileName: profile.attributes.name,
    certificateId: certificate.id,
    appId: app && app.id,
    created,
    profilePath,
    profileBase64Path
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
