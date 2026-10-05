import './App.css';
import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Footer from "./components/Footer";
import Navbar from "./components/Navbar";
import ScrollToTop from "./components/ScrollToTop";
import { AuthProvider, AdminRoute } from './auth/AuthContext';
import { ContentProvider } from './content/ContentContext';
import './auth.css';

const Home = lazy(() => import('./Pages/Home'));
const Teams = lazy(() => import('./Pages/Teams'));
const Events = lazy(() => import('./components/EventsPage'));
const EventDetail = lazy(() => import('./components/EventDetails'));
const ContactUs = lazy(() => import('./components/ContactUs'));
const Auth = lazy(() => import('./Pages/Auth'));
const Account = lazy(() => import('./Pages/Account'));
const Admin = lazy(() => import('./Pages/Admin'));
const NotFound = lazy(() => import('./Pages/NotFound'));

function App() {

  return (
    <>
      <BrowserRouter>
        <AuthProvider>
        <ContentProvider>
        <Navbar />
        <ScrollToTop />
        <Suspense fallback={<main className="route-loading" aria-busy="true"><span>Loading…</span></main>}>
        <Routes>
          
          <Route exact path='/' element={<Home />} />
          <Route exact path='/teams' element={<Teams />} />
          <Route exact path='/events' element={<Events />} />
          
          {/* Dynamic route for event details */}
          <Route exact path='/events/:slug' element={<EventDetail />} />

          <Route exact path='/contactus' element={<ContactUs />} />
          <Route path='/signin' element={<Auth key="signin" />} />
          <Route path='/signup' element={<Auth key="signup" />} />
          <Route path='/reset-password' element={<Auth key="reset" />} />
          <Route path='/account' element={<Account />} />
          <Route path='/admin' element={<AdminRoute><Admin /></AdminRoute>} />
          <Route path='*' element={<NotFound />} />
        </Routes>
        </Suspense>
        <Footer />
        </ContentProvider>
        </AuthProvider>
      </BrowserRouter>
    </>
  );
}

export default App;
