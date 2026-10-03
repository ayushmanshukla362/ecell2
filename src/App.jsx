import './App.css';
import Home from "./Pages/Home";
import Teams from "./Pages/Teams";
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Footer from "./components/Footer";
import Navbar from "./components/Navbar";
import Events from './components/EventsPage';
import EventDetail from './components/EventDetails'; // Import EventDetail component
import ContactUs from "./components/ContactUs";
import ScrollToTop from "./components/ScrollToTop";
import { AuthProvider, AdminRoute } from './auth/AuthContext';
import { ContentProvider } from './content/ContentContext';
import Auth from './Pages/Auth';
import Account from './Pages/Account';
import Admin from './Pages/Admin';
import NotFound from './Pages/NotFound';
import './auth.css';

function App() {

  return (
    <>
      <BrowserRouter>
        <AuthProvider>
        <ContentProvider>
        <Navbar />
        <ScrollToTop />
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
        <Footer />
        </ContentProvider>
        </AuthProvider>
      </BrowserRouter>
    </>
  );
}

export default App;
