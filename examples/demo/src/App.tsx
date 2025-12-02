import { Suspense, lazy } from 'react';

// Lazy load SAMDemo to avoid SSR issues with onnxruntime-web
const SAMDemo = lazy(() => import('./SAMDemo'));

function LoadingScreen() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
        <p className="text-muted-foreground">Loading SAM Demo...</p>
      </div>
    </div>
  );
}

function App() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <SAMDemo />
    </Suspense>
  );
}

export default App;
