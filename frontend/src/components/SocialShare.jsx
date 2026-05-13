function getShareUrl() {
  return window.location.href.split("#")[0];
}

function SocialShare() {
  const shareText = "DBKU fasTrack Advertisement License Application";

  function shareWhatsApp() {
    const url = `https://wa.me/?text=${encodeURIComponent(`${shareText} ${getShareUrl()}`)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function shareFacebook() {
    const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(getShareUrl())}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function shareNative() {
    const shareData = {
      title: shareText,
      text: shareText,
      url: getShareUrl(),
    };

    if (navigator.share) {
      await navigator.share(shareData);
      return;
    }

    await navigator.clipboard.writeText(getShareUrl());
  }

  return (
    <div className="mt-12 flex items-center justify-center gap-5">
      <button
        type="button"
        onClick={shareWhatsApp}
        className="flex h-14 w-14 items-center justify-center rounded-full border border-emerald-100 bg-white text-[#006d32] shadow-sm transition hover:border-[#006d32] hover:bg-emerald-50"
        aria-label="Share on WhatsApp"
        title="Share on WhatsApp"
      >
        <img src="/icon/Whatsapp.png" alt="" className="h-9 w-9 object-contain" />
      </button>
      <button
        type="button"
        onClick={shareFacebook}
        className="flex h-14 w-14 items-center justify-center rounded-full border border-emerald-100 bg-white text-[#006d32] shadow-sm transition hover:border-[#006d32] hover:bg-emerald-50"
        aria-label="Share on Facebook"
        title="Share on Facebook"
      >
        <img src="/icon/Facebook.png" alt="" className="h-9 w-9 object-contain" />
      </button>
      <button
        type="button"
        onClick={shareNative}
        className="flex h-14 w-14 items-center justify-center rounded-full border border-emerald-100 bg-white text-[#006d32] shadow-sm transition hover:border-[#006d32] hover:bg-emerald-50"
        aria-label="Share"
        title="Share"
      >
        <img src="/icon/share.png" alt="" className="h-9 w-9 object-contain" />
      </button>
    </div>
  );
}

export default SocialShare;
