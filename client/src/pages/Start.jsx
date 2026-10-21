// StartForm.aspx: landing page (company logo only).
export default function Start() {
  return (
    <div className="flex h-full min-h-[60vh] items-center justify-center">
      <img src="/Assets/Images/Logo.png" alt="Garuda" className="max-h-48 object-contain opacity-90" />
    </div>
  );
}
