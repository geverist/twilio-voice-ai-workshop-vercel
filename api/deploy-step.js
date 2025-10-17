/**
 * Multi-Step Workshop Deployment (Vercel Version)
 *
 * Breaks deployment into small steps that each complete under 10 seconds:
 * - Step 1: Create service + environment
 * - Step 2-N: Upload individual assets/functions
 * - Step N+1: Create build
 * - Step N+2: Deploy build
 *
 * Each step is a separate HTTP call from the browser.
 *
 * NOTE: This handles ONLY Twilio Serverless deployments (Steps 4 & 6).
 * WebSocket deployments (Steps 5, 7, 8) go to external hosting via GitHub.
 */

import twilio from 'twilio';
import https from 'https';
import FormData from 'form-data';

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  try {
    const {
      step,
      accountSid,
      authToken,
      serviceSid,
      environmentSid,
      buildSid,
      phoneNumber,
      openaiKey,
      websocketUrl,
      functionCode,
      filePath
    } = req.body;

    if (!accountSid || !authToken) {
      return res.status(400).json({
        success: false,
        error: 'Account SID and Auth Token are required'
      });
    }

    const studentClient = twilio(accountSid, authToken);

    // STEP 1: Create Service + Environment
    if (step === 'create-service') {
      console.log('Step 1: Creating service and environment...');

      const uniqueServiceName = `voice-ai-workshop-${Date.now()}`;

      // Create service
      const service = await studentClient.serverless.v1.services.create({
        uniqueName: uniqueServiceName,
        friendlyName: 'Voice AI Workshop'
      });

      console.log('Service created:', service.sid);

      // Create environment
      const environment = await studentClient.serverless.v1
        .services(service.sid)
        .environments
        .create({
          uniqueName: 'dev',
          domainSuffix: 'dev'
        });

      console.log('Environment created:', environment.sid);

      // Set environment variables
      const variables = [
        { key: 'TWILIO_ACCOUNT_SID', value: accountSid },
        { key: 'TWILIO_AUTH_TOKEN', value: authToken }
      ];

      if (phoneNumber) {
        variables.push({ key: 'DEFAULT_TWILIO_NUMBER', value: phoneNumber });
      }
      if (openaiKey) {
        variables.push({ key: 'OPENAI_API_KEY', value: openaiKey });
      }
      if (websocketUrl) {
        variables.push({ key: 'WEBSOCKET_URL', value: websocketUrl });
      }

      for (const variable of variables) {
        await studentClient.serverless.v1
          .services(service.sid)
          .environments(environment.sid)
          .variables
          .create({
            key: variable.key,
            value: variable.value
          });
      }

      console.log('Environment variables set');

      return res.status(200).json({
        success: true,
        message: 'Service and environment created',
        serviceSid: service.sid,
        environmentSid: environment.sid,
        domain: environment.domainName
      });
    }

    // STEP 2: Upload Single Function (from code string)
    if (step === 'upload-function-code') {
      console.log('Step 2: Uploading function from code:', filePath);

      if (!serviceSid || !functionCode || !filePath) {
        return res.status(400).json({
          success: false,
          error: 'serviceSid, functionCode, and filePath are required'
        });
      }

      // Use the provided code directly
      const fileContent = Buffer.from(functionCode, 'utf-8');

      // Create function
      const func = await studentClient.serverless.v1
        .services(serviceSid)
        .functions
        .create({
          friendlyName: filePath.replace('/', ''),
          path: filePath
        });

      // Create function version with content using FormData
      const form = new FormData();
      form.append('Path', filePath);
      form.append('Visibility', 'public');
      form.append('Content', fileContent, {
        filename: filePath.replace('/', '') + '.js',
        contentType: 'application/javascript'
      });

      await new Promise((resolve, reject) => {
        const req = https.request({
          hostname: 'serverless-upload.twilio.com',
          path: `/v1/Services/${serviceSid}/Functions/${func.sid}/Versions`,
          method: 'POST',
          auth: `${accountSid}:${authToken}`,
          headers: form.getHeaders()
        }, (response) => {
          let data = '';
          response.on('data', chunk => data += chunk);
          response.on('end', () => {
            if (response.statusCode >= 200 && response.statusCode < 300) {
              resolve(JSON.parse(data));
            } else {
              reject(new Error(`Upload failed: ${response.statusCode} ${data}`));
            }
          });
        });

        req.on('error', reject);
        form.pipe(req);
      });

      console.log('Function uploaded from code:', filePath);

      return res.status(200).json({
        success: true,
        message: 'Function uploaded',
        functionSid: func.sid,
        path: filePath
      });
    }

    // STEP 3: Create Build
    if (step === 'create-build') {
      console.log('Step 3: Creating build...');

      if (!serviceSid) {
        return res.status(400).json({
          success: false,
          error: 'serviceSid is required'
        });
      }

      // Fetch all functions and get their latest versions
      console.log('Fetching functions...');
      const functions = await studentClient.serverless.v1
        .services(serviceSid)
        .functions
        .list();

      // Deduplicate by path - keep only the LATEST version of each unique path
      const functionsByPath = new Map();
      for (const func of functions) {
        const versions = await studentClient.serverless.v1
          .services(serviceSid)
          .functions(func.sid)
          .functionVersions
          .list({ limit: 1 });

        if (versions.length > 0) {
          const version = versions[0];
          const path = version.path;

          // If we haven't seen this path, or this version is newer, use it
          if (!functionsByPath.has(path) ||
              new Date(version.dateCreated) > new Date(functionsByPath.get(path).dateCreated)) {
            functionsByPath.set(path, version);
          }
        }
      }

      const functionVersions = Array.from(functionsByPath.values()).map(v => v.sid);
      console.log(`Found ${functionVersions.length} unique function paths (deduplicated)`);

      // Create build with all function versions
      // Dependencies must be a JSON string array per Twilio API docs
      const dependenciesArray = [
        { name: 'twilio', version: '5.6.0' }
      ];

      const buildParams = {
        assetVersions: [], // No assets needed for voice handler
        functionVersions: functionVersions,
        dependencies: JSON.stringify(dependenciesArray)
      };

      console.log('Creating build with dependencies:', buildParams.dependencies);

      const build = await studentClient.serverless.v1
        .services(serviceSid)
        .builds
        .create(buildParams);

      console.log('Build created:', build.sid);

      return res.status(200).json({
        success: true,
        message: 'Build created',
        buildSid: build.sid
      });
    }

    // STEP 4: Wait for Build
    if (step === 'check-build') {
      console.log('Step 4: Checking build status...');

      if (!serviceSid || !buildSid) {
        return res.status(400).json({
          success: false,
          error: 'serviceSid and buildSid are required'
        });
      }

      const buildStatus = await studentClient.serverless.v1
        .services(serviceSid)
        .builds(buildSid)
        .fetch();

      return res.status(200).json({
        success: true,
        status: buildStatus.status,
        building: buildStatus.status === 'building'
      });
    }

    // STEP 5: Deploy Build
    if (step === 'deploy-build') {
      console.log('Step 5: Deploying build...');

      if (!serviceSid || !environmentSid || !buildSid) {
        return res.status(400).json({
          success: false,
          error: 'serviceSid, environmentSid, and buildSid are required'
        });
      }

      const deployment = await studentClient.serverless.v1
        .services(serviceSid)
        .environments(environmentSid)
        .deployments
        .create({
          buildSid: buildSid
        });

      const environment = await studentClient.serverless.v1
        .services(serviceSid)
        .environments(environmentSid)
        .fetch();

      console.log('Deployment complete:', deployment.sid);

      return res.status(200).json({
        success: true,
        message: 'Deployment complete',
        deploymentSid: deployment.sid,
        url: `https://${environment.domainName}`
      });
    }

    // Invalid step
    return res.status(400).json({
      success: false,
      error: 'Invalid step parameter'
    });

  } catch (error) {
    console.error('Deploy step error:', error);
    return res.status(500).json({
      success: false,
      error: 'Deployment step failed',
      details: error.message,
      stack: error.stack
    });
  }
}
