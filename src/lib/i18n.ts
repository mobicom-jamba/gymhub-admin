const mn: Record<string, string> = {
  // Nav
  dashboard: "Тойм",
  gyms: "Фитнес төвүүд",
  users: "Хэрэглэгчид",
  bookings: "Захиалгууд",
  activity: "Үйл ажиллагаа",
  classes: "Хичээлүүд",
  calendar: "Календарь",
  profile: "Профайл",
  menu: "Цэс",
  others: "Бусад",

  // Common
  home: "Нүүр",
  loading: "Уншиж байна...",
  error: "Алдаа",
  save: "Хадгалах",
  cancel: "Цуцлах",
  delete: "Устгах",
  edit: "Засах",
  add: "Нэмэх",
  search: "Хайх",
  filter: "Шүүх",
  actions: "Үйлдлүүд",
  status: "Төлөв",
  name: "Нэр",
  date: "Огноо",
  time: "Цаг",

  // Dashboard
  totalGyms: "Нийт фитнес төв",
  totalUsers: "Нийт хэрэглэгч",
  totalBookings: "Нийт захиалга",
  recentActivity: "Сүүлийн үйл ажиллагаа",

  // Gyms
  logo: "Лого",
  gymName: "Нэр",
  gymAddress: "Хаяг",
  gymAmenities: "Тоноглол",
  gymHours: "Цагийн хуваарь",
  active: "Идэвхтэй",
  inactive: "Идэвхгүй",

  // Users
  fullName: "Бүтэн нэр",
  phone: "Утас",
  role: "Эрх",
  member: "Гишүүн",
  trainer: "Дасгалжуулагч",
  admin: "Админ",

  // Bookings
  booked: "Захиалагдсан",
  cancelled: "Цуцлагдсан",
  attended: "Ирсэн",
  noShow: "Ирээгүй",
  markAttended: "Ирц бүртгэх",
  classTitle: "Хичээл",
  user: "Хэрэглэгч",

  // Activity
  bookingCreated: "Захиалга үүсгэсэн",
  bookingCancelled: "Захиалга цуцласан",
  checkIn: "Ирц бүртгэсэн",
  workoutCompleted: "Дасгал дууссан",

  // Classes
  title: "Гарчиг",
  trainerName: "Дасгалжуулагч",
  capacity: "Багтаамж",
  duration: "Үргэлжлэх хугацаа",
  level: "Түвшин",
  category: "Ангилал",

  // Forms
  description: "Тайлбар",
  imageUrl: "Зургийн URL",
  email: "Имэйл",
  password: "Нууц үг",
  emailAddress: "Имэйл хаяг",
  membershipTier: "Гишүүнчлэлийн зэрэг",
  selectOption: "Сонгох",
  
  // Profile
  personalInformation: "Хувийн мэдээлэл",
  firstName: "Нэр",
  lastName: "Овог",
  bio: "Танилцуулга",
  socialLinks: "Сошиал холбоосууд",
  editPersonalInformation: "Хувийн мэдээлэл засах",
  updateDetails: "Мэдээллээ шинэчлэн профайлаа сайжруулаарай",
  close: "Хаах",
  saveChanges: "Өөрчлөлт хадгалах",
  
  // Messages
  notFound: "Олдсонгүй",
  select: "Сонгох",
  schedule: "цагийн хуваарь",
  schedules: "Цагийн хуваарь",
  pleaseSelectClass: "Хичээл сонгоно уу",
  pleaseSelectGym: "Фитнес төв сонгоно уу",
  pleaseSelectUserAndSchedule: "Хэрэглэгч болон цагийн хуваарь сонгоно уу",
  confirmDelete: "устгахыг хүсэж байна уу?",
  confirmDeleteUser: "Хэрэглэгчийг устгах уу? Энэ үйлдэл буцаагдахгүй.",
  confirmDeleteSchedule: "Цагийн хуваарийг устгах уу?",
  pleaseEnterTitle: "Гарчиг оруулна уу",
  capacityMustBeGreaterThanOne: "Багтаамж 1-ээс их байх ёстой",
  pleaseEnterName: "Нэр оруулна уу",
  pleaseEnterEmailAndPassword: "Имэйл болон нууц үг оруулна уу",
  errorOccurred: "Системийн алдаа гарлаа",
  visits: "Ирц",
  method: "Арга",
  backToDashboard: "Эхлэл рүү буцах",
};

export type Locale = "mn" | "en";

export function t(key: string, locale: Locale = "mn"): string {
  if (locale === "en") return key;
  return mn[key] ?? key;
}
