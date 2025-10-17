/**
 * Conversational Intelligence Analytics API (Vercel Version)
 *
 * Retrieves transcripts and analytics for calls made during the workshop.
 * Used in Step 9 "big reveal" analytics dashboard.
 */

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  const { accountSid, authToken, serviceSid } = req.query;

  if (!accountSid || !authToken || !serviceSid) {
    return res.status(400).json({
      success: false,
      error: 'Account SID, Auth Token, and Service SID are required'
    });
  }

  try {
    const baseUrl = 'https://intelligence.twilio.com/v2';
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

    // =========================================================================
    // FETCH ALL TRANSCRIPTS
    // =========================================================================
    console.log('Fetching transcripts for service:', serviceSid);

    const transcriptsResponse = await fetch(
      `${baseUrl}/Transcripts?ServiceSid=${serviceSid}`,
      {
        headers: {
          'Authorization': `Basic ${auth}`
        }
      }
    );

    if (!transcriptsResponse.ok) {
      const errorText = await transcriptsResponse.text();
      console.error('Failed to fetch transcripts:', errorText);
      return res.status(transcriptsResponse.status).json({
        success: false,
        error: 'Failed to fetch transcripts',
        details: errorText
      });
    }

    const transcriptsData = await transcriptsResponse.json();
    const transcripts = transcriptsData.transcripts || [];

    console.log(`Found ${transcripts.length} transcripts`);

    // =========================================================================
    // ENRICH TRANSCRIPTS WITH ANALYTICS
    // =========================================================================
    // For each transcript, fetch:
    // - Sentences (full conversation text)
    // - Operator results (sentiment, PII, topics, etc.)

    const enrichedTranscripts = await Promise.all(
      transcripts.map(async (transcript) => {
        try {
          // Fetch sentences (conversation text)
          const sentencesResponse = await fetch(
            `${baseUrl}/Transcripts/${transcript.sid}/Sentences`,
            {
              headers: {
                'Authorization': `Basic ${auth}`
              }
            }
          );

          let sentences = [];
          if (sentencesResponse.ok) {
            const sentencesData = await sentencesResponse.json();
            sentences = sentencesData.sentences || [];
          }

          // Fetch operator results (sentiment, PII, etc.)
          const operatorResultsResponse = await fetch(
            `${baseUrl}/Transcripts/${transcript.sid}/OperatorResults`,
            {
              headers: {
                'Authorization': `Basic ${auth}`
              }
            }
          );

          let operatorResults = [];
          if (operatorResultsResponse.ok) {
            const operatorResultsData = await operatorResultsResponse.json();
            operatorResults = operatorResultsData.operator_results || [];
          }

          // Parse sentiment data
          let sentiment = null;
          const sentimentOperator = operatorResults.find(
            op => op.operator_type === 'sentiment_analysis'
          );
          if (sentimentOperator && sentimentOperator.extract_results) {
            sentiment = sentimentOperator.extract_results;
          }

          // Parse PII data
          let piiResults = null;
          const piiOperator = operatorResults.find(
            op => op.operator_type === 'pii_redaction'
          );
          if (piiOperator && piiOperator.redaction_results) {
            piiResults = piiOperator.redaction_results;
          }

          return {
            sid: transcript.sid,
            customerKey: transcript.customer_key,
            mediaStartTime: transcript.media_start_time,
            status: transcript.status,
            sentences: sentences,
            sentiment: sentiment,
            piiResults: piiResults,
            operatorResults: operatorResults
          };

        } catch (enrichError) {
          console.error(`Error enriching transcript ${transcript.sid}:`, enrichError);
          return {
            sid: transcript.sid,
            customerKey: transcript.customer_key,
            mediaStartTime: transcript.media_start_time,
            status: transcript.status,
            error: 'Failed to enrich transcript data'
          };
        }
      })
    );

    // =========================================================================
    // RETURN ENRICHED TRANSCRIPTS
    // =========================================================================
    return res.status(200).json({
      success: true,
      serviceSid: serviceSid,
      count: enrichedTranscripts.length,
      transcripts: enrichedTranscripts
    });

  } catch (error) {
    console.error('CI Analytics error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch analytics',
      details: error.message
    });
  }
}
