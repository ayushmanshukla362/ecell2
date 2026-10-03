import Idea from '../components/Idea'
import Mentor from '../components/Mentor'
import AboutSection from '../components/home/AboutSection'
import AchievementsSection from '../components/home/AchievementsSection'
import EventsSection from '../components/home/EventsSection'
import HeroSection from '../components/home/HeroSection'
import TeamPreviewSection from '../components/home/TeamPreviewSection'
import Testimonial from '../components/Testimonial'

function Home() {
  return (
    <main className="home-page">
      <HeroSection />
      <AboutSection />
      <AchievementsSection />
      <EventsSection />
      <TeamPreviewSection />
      <Mentor />
      <Testimonial />
      <Idea />
    </main>
  )
}

export default Home
