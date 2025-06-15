import React, { useState, useRef } from 'react';
import { Upload, FileAudio, Play, Pause, Download, Copy, AlertCircle, CheckCircle, Loader2, ExternalLink, Bug } from 'lucide-react';

interface TranscriptionState {
  status: 'idle' | 'uploading' | 'processing' | 'success' | 'error';
  transcript?: string;
  error?: string;
  progress?: number;
  fullError?: any; // Store the complete error object for debugging
}

function App() {
  const [file, setFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [transcription, setTranscription] = useState<TranscriptionState>({ status: 'idle' });
  const [isDragOver, setIsDragOver] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [showNgrokWarning, setShowNgrokWarning] = useState(false);
  const [showDebugInfo, setShowDebugInfo] = useState(false);
  
  const audioRef = useRef<HTMLAudioElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const API_URL = 'https://certain-monarch-vertically.ngrok-free.app';

  const handleFileSelect = (selectedFile: File) => {
    if (!selectedFile.type.startsWith('audio/')) {
      setTranscription({ status: 'error', error: 'Please select a valid audio file' });
      return;
    }
    
    if (selectedFile.size > 25 * 1024 * 1024) { // 25MB limit
      setTranscription({ status: 'error', error: 'File size must be less than 25MB' });
      return;
    }

    setFile(selectedFile);
    setAudioUrl(URL.createObjectURL(selectedFile));
    setTranscription({ status: 'idle' });
    setIsPlaying(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      handleFileSelect(droppedFile);
    }
  };

  const togglePlayPause = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const testApiConnection = async () => {
    try {
      console.log('Testing API connection...');
      const response = await fetch(`${API_URL}/health`, {
        method: 'GET',
        headers: {
          'ngrok-skip-browser-warning': 'true',
        },
      });
      console.log('Health check response:', response);
      return response.ok;
    } catch (error) {
      console.error('Health check failed:', error);
      return false;
    }
  };

  const transcribeAudio = async () => {
    if (!file) return;

    console.log('Starting transcription for file:', file.name, 'Size:', file.size);
    setTranscription({ status: 'uploading', progress: 0 });

    try {
      const formData = new FormData();
      formData.append('file', file);
      
      console.log('FormData created, making request to:', `${API_URL}/transcribe`);

      // Add a timeout to the fetch request
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.log('Request timed out after 2 minutes');
        controller.abort();
      }, 120000); // 2 minute timeout

      const requestHeaders = {
        // Multiple ways to bypass ngrok warning
        'ngrok-skip-browser-warning': 'true',
        'User-Agent': 'AudioTranscriptionApp/1.0',
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      };

      console.log('Request headers:', requestHeaders);

      const response = await fetch(`${API_URL}/transcribe`, {
        method: 'POST',
        body: formData,
        headers: requestHeaders,
        signal: controller.signal,
        mode: 'cors',
        credentials: 'omit',
      });

      clearTimeout(timeoutId);

      console.log('Response received:', {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        url: response.url,
        ok: response.ok,
        redirected: response.redirected,
        type: response.type
      });

      if (!response.ok) {
        let errorText = '';
        let errorData = null;
        
        try {
          const contentType = response.headers.get('content-type');
          console.log('Response content-type:', contentType);
          
          if (contentType?.includes('application/json')) {
            errorData = await response.json();
            errorText = JSON.stringify(errorData, null, 2);
            console.log('Error response JSON:', errorData);
          } else {
            errorText = await response.text();
            console.log('Error response text:', errorText);
          }
        } catch (parseError) {
          console.error('Failed to parse error response:', parseError);
          errorText = 'Unable to parse error response';
        }
        
        // Check if this looks like the ngrok warning page
        if (errorText.includes('ngrok.com') || errorText.includes('Visit Site') || errorText.includes('ngrok-skip-browser-warning')) {
          console.log('Detected ngrok warning page');
          setShowNgrokWarning(true);
          throw new Error('Please visit the API URL first to bypass the ngrok warning page');
        }
        
        const fullError = {
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
          body: errorText,
          url: response.url,
          timestamp: new Date().toISOString()
        };
        
        console.error('Full error details:', fullError);
        
        throw new Error(`Server error (${response.status}): ${errorText}`);
      }

      setTranscription({ status: 'processing', progress: 50 });
      console.log('Processing response...');

      let result;
      try {
        const responseText = await response.text();
        console.log('Raw response text:', responseText);
        
        result = JSON.parse(responseText);
        console.log('Parsed response:', result);
      } catch (parseError) {
        console.error('Failed to parse response JSON:', parseError);
        throw new Error('Invalid response format from server');
      }
      
      if (result.transcript || result.text) {
        const transcript = result.transcript || result.text;
        console.log('Transcription successful, length:', transcript.length);
        setTranscription({ 
          status: 'success', 
          transcript: transcript,
          progress: 100 
        });
      } else {
        console.error('No transcript in response:', result);
        throw new Error('No transcript received from server');
      }
    } catch (error) {
      console.error('Transcription error:', error);
      
      let errorMessage = 'Failed to transcribe audio';
      let fullError = null;
      
      if (error instanceof Error) {
        console.log('Error details:', {
          name: error.name,
          message: error.message,
          stack: error.stack,
          cause: error.cause
        });
        
        fullError = {
          name: error.name,
          message: error.message,
          stack: error.stack,
          cause: error.cause,
          timestamp: new Date().toISOString()
        };
        
        if (error.name === 'AbortError') {
          errorMessage = 'Request timed out. Please try again with a shorter audio file.';
        } else if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError') || error.message.includes('TypeError')) {
          // This is likely the ngrok warning page issue
          errorMessage = 'Unable to connect to the transcription service. Please visit the API URL first to bypass the ngrok warning page.';
          setShowNgrokWarning(true);
        } else if (error.message.includes('ngrok warning')) {
          errorMessage = error.message;
          setShowNgrokWarning(true);
        } else {
          errorMessage = error.message;
        }
      } else {
        console.log('Non-Error object thrown:', error);
        fullError = {
          type: typeof error,
          value: error,
          timestamp: new Date().toISOString()
        };
        // For non-Error objects, also assume it might be a network issue
        setShowNgrokWarning(true);
      }
      
      setTranscription({ 
        status: 'error', 
        error: errorMessage,
        fullError: fullError
      });
    }
  };

  const copyToClipboard = async () => {
    if (transcription.transcript) {
      try {
        await navigator.clipboard.writeText(transcription.transcript);
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
      } catch (error) {
        console.error('Failed to copy:', error);
      }
    }
  };

  const copyErrorDetails = async () => {
    if (transcription.fullError) {
      try {
        const errorDetails = JSON.stringify(transcription.fullError, null, 2);
        await navigator.clipboard.writeText(errorDetails);
        console.log('Error details copied to clipboard');
      } catch (error) {
        console.error('Failed to copy error details:', error);
      }
    }
  };

  const downloadTranscript = () => {
    if (transcription.transcript) {
      const blob = new Blob([transcription.transcript], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `transcript-${file?.name?.replace(/\.[^/.]+$/, '') || 'audio'}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  const resetApp = () => {
    setFile(null);
    setAudioUrl(null);
    setIsPlaying(false);
    setTranscription({ status: 'idle' });
    setShowNgrokWarning(false);
    setShowDebugInfo(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      <div className="container mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl mb-6 shadow-lg">
            <FileAudio className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Audio Transcription
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Upload your audio files and get accurate transcriptions powered by Whisper AI
          </p>
        </div>

        <div className="max-w-4xl mx-auto">
          {/* Ngrok Warning Notice */}
          {showNgrokWarning && (
            <div className="mb-8 bg-amber-50 border border-amber-200 rounded-2xl p-6">
              <div className="flex items-start space-x-3">
                <AlertCircle className="w-6 h-6 text-amber-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-medium text-amber-900 mb-2">API Setup Required</h3>
                  <p className="text-amber-800 mb-4">
                    You need to visit the API URL first to bypass the ngrok warning page. This is a one-time setup.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <a
                      href={API_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition-colors duration-200"
                    >
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Visit API URL
                    </a>
                    <button
                      onClick={() => setShowNgrokWarning(false)}
                      className="px-4 py-2 bg-white hover:bg-gray-50 text-amber-800 rounded-lg font-medium border border-amber-300 transition-colors duration-200"
                    >
                      I've visited the URL
                    </button>
                  </div>
                  <div className="mt-4 text-sm text-amber-700">
                    <p className="font-medium">Instructions:</p>
                    <ol className="list-decimal list-inside mt-1 space-y-1">
                      <li>Click "Visit API URL" above</li>
                      <li>On the ngrok warning page, click "Visit Site"</li>
                      <li>Come back here and click "I've visited the URL"</li>
                      <li>Try transcribing your audio again</li>
                    </ol>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* File Upload Area */}
          <div 
            className={`relative border-2 border-dashed rounded-2xl p-12 text-center transition-all duration-300 ${
              isDragOver 
                ? 'border-indigo-400 bg-indigo-50' 
                : file 
                ? 'border-emerald-300 bg-emerald-50' 
                : 'border-gray-300 bg-white hover:border-indigo-300 hover:bg-indigo-50/50'
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            
            {!file ? (
              <div className="space-y-4">
                <div className="mx-auto w-16 h-16 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full flex items-center justify-center">
                  <Upload className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    Drop your audio file here
                  </h3>
                  <p className="text-gray-500">
                    Or click to browse • MP3, WAV, M4A • Max 25MB
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="mx-auto w-16 h-16 bg-emerald-500 rounded-full flex items-center justify-center">
                  <CheckCircle className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">
                    {file.name}
                  </h3>
                  <p className="text-gray-500">
                    {(file.size / (1024 * 1024)).toFixed(2)} MB
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Audio Player */}
          {audioUrl && (
            <div className="mt-8 bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
              <div className="flex items-center space-x-4">
                <button
                  onClick={togglePlayPause}
                  className="w-12 h-12 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white hover:shadow-lg transition-all duration-200 hover:scale-105"
                >
                  {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
                </button>
                <div className="flex-1">
                  <p className="font-medium text-gray-900">{file?.name}</p>
                  <p className="text-sm text-gray-500">Ready for transcription</p>
                </div>
                <button
                  onClick={transcribeAudio}
                  disabled={transcription.status === 'uploading' || transcription.status === 'processing'}
                  className="px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl font-medium hover:shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105"
                >
                  {transcription.status === 'uploading' || transcription.status === 'processing' ? (
                    <div className="flex items-center space-x-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>
                        {transcription.status === 'uploading' ? 'Uploading...' : 'Transcribing...'}
                      </span>
                    </div>
                  ) : (
                    'Transcribe'
                  )}
                </button>
              </div>
              <audio
                ref={audioRef}
                src={audioUrl}
                onEnded={() => setIsPlaying(false)}
                className="hidden"
              />
            </div>
          )}

          {/* Progress Bar */}
          {(transcription.status === 'uploading' || transcription.status === 'processing') && (
            <div className="mt-6 bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
              <div className="flex items-center space-x-4 mb-4">
                <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
                <span className="font-medium text-gray-900">
                  {transcription.status === 'uploading' ? 'Uploading file...' : 'Processing transcription...'}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-gradient-to-r from-indigo-500 to-purple-600 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${transcription.progress || 0}%` }}
                />
              </div>
            </div>
          )}

          {/* Error State */}
          {transcription.status === 'error' && (
            <div className="mt-6 bg-red-50 border border-red-200 rounded-2xl p-6">
              <div className="flex items-start space-x-3">
                <AlertCircle className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-medium text-red-900">Transcription Failed</h3>
                  <p className="text-red-700 mt-1">{transcription.error}</p>
                  
                  {/* Debug Information Toggle */}
                  {transcription.fullError && (
                    <div className="mt-4">
                      <button
                        onClick={() => setShowDebugInfo(!showDebugInfo)}
                        className="inline-flex items-center px-3 py-1 bg-red-100 hover:bg-red-200 text-red-800 rounded-lg text-sm font-medium transition-colors duration-200"
                      >
                        <Bug className="w-4 h-4 mr-1" />
                        {showDebugInfo ? 'Hide' : 'Show'} Debug Info
                      </button>
                      
                      {showDebugInfo && (
                        <div className="mt-3 p-3 bg-red-100 rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-red-900">Full Error Details:</span>
                            <button
                              onClick={copyErrorDetails}
                              className="px-2 py-1 bg-red-200 hover:bg-red-300 text-red-800 rounded text-xs font-medium transition-colors duration-200"
                            >
                              Copy
                            </button>
                          </div>
                          <pre className="text-xs text-red-800 bg-red-50 p-2 rounded overflow-x-auto whitespace-pre-wrap">
                            {JSON.stringify(transcription.fullError, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                  
                  <div className="mt-3 text-sm text-red-600">
                    <p className="font-medium">Troubleshooting tips:</p>
                    <ul className="list-disc list-inside mt-1 space-y-1">
                      <li>Make sure your API server is running</li>
                      <li>Check if the ngrok URL is accessible</li>
                      <li>Try with a smaller audio file</li>
                      <li>Ensure the audio file is in a supported format</li>
                      <li>If you see the ngrok warning page, click "Visit Site" first</li>
                      <li>Check the browser console for additional error details</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Transcript Display */}
          {transcription.status === 'success' && transcription.transcript && (
            <div className="mt-8 bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
              <div className="border-b border-gray-100 p-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">Transcript</h3>
                  <div className="flex space-x-2">
                    <button
                      onClick={copyToClipboard}
                      className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
                        copySuccess 
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
                          : 'bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-200'
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        {copySuccess ? (
                          <CheckCircle className="w-4 h-4" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                        <span>{copySuccess ? 'Copied!' : 'Copy'}</span>
                      </div>
                    </button>
                    <button
                      onClick={downloadTranscript}
                      className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-lg font-medium hover:shadow-lg transition-all duration-200 hover:scale-105"
                    >
                      <div className="flex items-center space-x-2">
                        <Download className="w-4 h-4" />
                        <span>Download</span>
                      </div>
                    </button>
                  </div>
                </div>
              </div>
              <div className="p-6">
                <div className="prose prose-gray max-w-none">
                  <p className="text-gray-800 leading-relaxed whitespace-pre-wrap">
                    {transcription.transcript}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Reset Button */}
          {(file || transcription.status !== 'idle') && (
            <div className="mt-8 text-center">
              <button
                onClick={resetApp}
                className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium transition-all duration-200 border border-gray-200"
              >
                Upload New File
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;