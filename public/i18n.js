// Everything players see lives here (Azerbaijani). The admin panel stays in English.
const TEXT = {
  title: "Gizli Santa",
  yourName: "Adınız",
  selectName: "-- Seçin --",
  password: "Parol",
  passwordPlaceholder: "Sizə göndərilən parol",
  login: "Daxil ol",
  showPassword: "Parolu göstər",
  hidePassword: "Parolu gizlət",
  logout: "Çıxış",
  fillIn: "Adınızı seçin və parolu yazın",
  wrongCreds: "Ad və ya parol yanlışdır",
  tooMany: "Çox uğursuz cəhd oldu. Bir neçə dəqiqə sonra yenidən cəhd edin.",
  loginFailed: "Giriş alınmadı. Yenidən cəhd edin.",
  hello: "Salam, {name}!",
  idle: "Oyun hələ başlamayıb.",
  cancelled: "Oyun ləğv edildi.",
  notParticipating: "Siz bu püşkatmada iştirak etmirsiniz.",
  loggedInNote: "Daxil oldunuz. Püşkatma taymer bitəndə avtomatik başlayacaq.",
  everyoneMustLogin: "Hamı daxil olmalıdır, yoxsa oyun ləğv olunacaq.",
  days: "gün",
  hours: "saat",
  mins: "dəq",
  secs: "san",
  loggedInCount: "Daxil olanlar: {in} / {total}",
  spin: "Fırlat",
  spinning: "Fırlanır…",
  checkPhone: "Telefonu tutanın siz olduğunuza əmin olun",
  resultLabel: "Siz bu şəxsin Gizli Santasısınız:",
  and: "və",
  spinTwice: "İki dəfə fırladacaqsınız.",
  spinOnceMore: "Bir dəfə də fırladın.",
  error: "Xəta baş verdi. Yenidən cəhd edin.",
};

function t(key, vars = {}) {
  return TEXT[key].replace(/\{(\w+)\}/g, (_, k) => vars[k]);
}
