import { useEffect, useRef, type ReactNode } from 'react';
import { ClerkProvider, Show, SignIn, SignUp, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Redirect, Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import { Toaster } from 'sonner';
import { ErrorBoundary } from '@/components/error-boundary';
import { Brand, ThemeToggle } from './components/career-ui';
import { ApplicationsPage, CoverLettersPage, CvsPage, DashboardPage, Landing, ListingsPage, OpportunityPage, ProfilePage, SavedPage, SettingsPage } from './pages/career-pages';

const queryClient = new QueryClient({defaultOptions:{queries:{retry:1,staleTime:30000}}});
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
function stripBase(path:string):string{return basePath&&path.startsWith(basePath)?path.slice(basePath.length)||'/':path}
if(!clerkPubKey){throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file')}
const clerkAppearance={
  options:{logoPlacement:'inside' as const,logoLinkUrl:basePath||'/',logoImageUrl:`${window.location.origin}${basePath}/logo.svg`},
  variables:{colorPrimary:'#286a62',colorForeground:'#233238',colorMutedForeground:'#69787a',colorDanger:'#bc584f',colorBackground:'#faf8f2',colorInput:'#faf8f2',colorInputForeground:'#233238',colorNeutral:'#d6d3c9',fontFamily:'DM Sans, sans-serif',borderRadius:'14px'},
  elements:{cardBox:{background:'#faf8f2',border:'1px solid #d6d3c9',borderRadius:'22px',boxShadow:'0 25px 70px -45px #233238',width:'430px',maxWidth:'100%'},card:{boxShadow:'none',background:'transparent'},footer:{background:'transparent'},headerTitle:{fontFamily:'Outfit, sans-serif',fontSize:'27px',color:'#233238'},headerSubtitle:{color:'#69787a'},formButtonPrimary:{background:'#286a62'},formFieldInput:{background:'#faf8f2',color:'#233238'},footerActionLink:{color:'#286a62'}}
};
function AuthPage({mode}:{mode:'in'|'up'}){return <div className="min-h-[100dvh] bg-background"><header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-6 md:px-10"><Brand/><ThemeToggle/></header><div className="mx-auto grid max-w-7xl items-center gap-14 px-5 pb-16 pt-8 md:min-h-[calc(100dvh-100px)] md:grid-cols-2 md:px-10 md:pt-0"><div className="hidden md:block"><div className="eyebrow">YOUR NEXT CHAPTER</div><h1 className="display mt-6 max-w-[520px] text-6xl font-semibold leading-[1.04]">{mode==='in'?'Pick up where you left off.':'Good things begin with a first step.'}</h1><p className="mt-6 max-w-sm text-base leading-relaxed text-muted-foreground">A more thoughtful way to discover opportunities, prepare your applications, and keep moving forward in Riyadh.</p><div className="mt-12 h-px max-w-md bg-border"/><p className="mt-5 text-xs text-muted-foreground">The process is yours. We’re here to make it clearer.</p></div><div className="flex justify-center">{mode==='in'?<SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} fallbackRedirectUrl={`${basePath}/dashboard`}/>:<SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} fallbackRedirectUrl={`${basePath}/dashboard`}/>}</div></div></div>}
function Protected({children}:{children:ReactNode}){return <><Show when="signed-in">{children}</Show><Show when="signed-out"><Redirect to="/"/></Show></>}
function Home(){return <><Show when="signed-in"><Redirect to="/dashboard"/></Show><Show when="signed-out"><Landing/></Show></>}
function NotFound(){return <div className="grid min-h-[100dvh] place-items-center px-5 text-center"><div><div className="eyebrow">404 / WRONG TURN</div><h1 className="display mt-4 text-5xl font-semibold">This path isn’t here.</h1><p className="mt-3 text-sm text-muted-foreground">Let’s get you back to a familiar place.</p><a href={basePath||'/'} className="btn btn-primary mt-7">Go home</a></div></div>}
function CacheInvalidator(){const {addListener}=useClerk();const qc=useQueryClient();const last=useRef<string|null|undefined>(undefined);useEffect(()=>addListener(({user})=>{const id=user?.id??null;if(last.current!==undefined&&last.current!==id)qc.clear();last.current=id}),[addListener,qc]);return null}
function Routes(){return <Switch><Route path="/" component={Home}/><Route path="/sign-in/*?"><AuthPage mode="in"/></Route><Route path="/sign-up/*?"><AuthPage mode="up"/></Route><Route path="/dashboard"><Protected><DashboardPage/></Protected></Route><Route path="/discover"><Protected><ListingsPage/></Protected></Route><Route path="/training"><Protected><ListingsPage training/></Protected></Route><Route path="/opportunities/:id"><Protected><OpportunityPage/></Protected></Route><Route path="/saved"><Protected><SavedPage/></Protected></Route><Route path="/applications"><Protected><ApplicationsPage/></Protected></Route><Route path="/cvs"><Protected><CvsPage/></Protected></Route><Route path="/cover-letters"><Protected><CoverLettersPage/></Protected></Route><Route path="/profile"><Protected><ProfilePage/></Protected></Route><Route path="/settings"><Protected><SettingsPage/></Protected></Route><Route component={NotFound}/></Switch>}
function RoutedErrorBoundary({children}:{children:ReactNode}){const [location]=useLocation();return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>}
function ClerkProviderWithRoutes(){const [,setLocation]=useLocation();return <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} appearance={clerkAppearance} signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} localization={{signIn:{start:{title:'Welcome back',subtitle:'Continue your journey in Riyadh'}},signUp:{start:{title:'Start your journey',subtitle:'Make room for what comes next'}}}} routerPush={to=>setLocation(stripBase(to))} routerReplace={to=>setLocation(stripBase(to),{replace:true})}><CacheInvalidator/><RoutedErrorBoundary><Routes/></RoutedErrorBoundary></ClerkProvider>}
function App(){useEffect(()=>{document.documentElement.classList.toggle('dark',localStorage.getItem('cf-theme')==='dark')},[]);return <QueryClientProvider client={queryClient}><WouterRouter base={basePath}><ClerkProviderWithRoutes/></WouterRouter><Toaster position="bottom-right" richColors/></QueryClientProvider>}
export default App;