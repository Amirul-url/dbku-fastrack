import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import AdminDashboardLayout from "../../../../layout/AdminDashboardLayout";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  apiRequest,
  fetchAuthenticatedBlob,
  getSiteImageUrl,
  uploadApplicationDocument,
} from "../../../../services/api";
import AdminApplicationStepNav from "../AdminApplicationStepNav";
import SimpleWysiwygEditor from "../../../../components/SimpleWysiwygEditor";
import { useLanguage } from "../../../../context/LanguageContext";
import {
  applicationStatusLabel,
  applicationTypeLabel,
  stepText,
} from "../../user/steps/ApplicationStepText";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || "YOUR_MAPBOX_TOKEN";
mapboxgl.accessToken = MAPBOX_TOKEN;

function AdminStep1Page() {
  const Layout = AdminDashboardLayout;

  const navigate = useNavigate();
  const location = useLocation();
  const { language } = useLanguage();
  const tx = (key) => stepText(language, key);
  const { applicationId: routeApplicationId } = useParams();
  const queryParams = new URLSearchParams(location.search);

  const applicationIdRaw =
    routeApplicationId || location.state?.applicationId || queryParams.get("id");

  const applicationId = applicationIdRaw ? Number(applicationIdRaw) : null;

  const [projectName, setProjectName] = useState("");
  const [localityAddress, setLocalityAddress] = useState("");
  const [areaRequired, setAreaRequired] = useState("");
  const [areaUnit, setAreaUnit] = useState("Sq. M");
  const [sourceOfFund, setSourceOfFund] = useState("");
  const [fundAvailability, setFundAvailability] = useState("");
  const [amountFundApproved, setAmountFundApproved] = useState("");

  const [siteImageName, setSiteImageName] = useState("");
  const [siteImagePreview, setSiteImagePreview] = useState("");
  const [siteImageFile, setSiteImageFile] = useState(null);
  const [siteImageAttachment, setSiteImageAttachment] = useState(null);

  const [mapData, setMapData] = useState({
    address: "",
    latitude: 1.586684,
    longitude: 110.334028,
  });

  const [projectJustification, setProjectJustification] = useState("");
  const [siteSelectionReason, setSiteSelectionReason] = useState("");

  useEffect(() => {
    if (applicationId) loadDraft();
  }, [applicationId]);

  async function loadDraft() {
    try {
      const data = await apiRequest(`/applications/${applicationId}/`);
      const step1 = data.form_data?.step_1 || {};

      setProjectName(step1.project_name || "");
      setLocalityAddress(step1.locality_address || step1.map_address || "");
      setAreaRequired(step1.area_required || "");
      setAreaUnit(step1.area_unit || "Sq. M");
      setSourceOfFund(step1.source_of_fund || "");
      setFundAvailability(step1.fund_availability || "");
      setAmountFundApproved(step1.amount_fund_approved || "");

      const siteImageDocument =
        data.supporting_documents
          ?.slice()
          .reverse()
          .find((document) => document.title === "Site Image") || null;
      const savedSiteImage = siteImageDocument || step1.site_image || null;
      const savedSiteImageUrl = getSiteImageUrl(
        applicationId,
        savedSiteImage,
        step1
      );
      setSiteImageName(
        savedSiteImage?.name ||
          savedSiteImage?.file?.split("/")?.pop() ||
          step1.site_image_name ||
          ""
      );
      setSiteImagePreview(savedSiteImageUrl);
      setSiteImageFile(null);
      setSiteImageAttachment(savedSiteImage);

      setMapData({
        address: step1.map_address || step1.locality_address || "",
        latitude: Number(step1.latitude || 1.586684),
        longitude: Number(step1.longitude || 110.334028),
      });

      setProjectJustification(step1.project_justification || "");
      setSiteSelectionReason(step1.site_selection_reason || "");
    } catch (err) {
      console.error("Failed to load draft:", err);
    }
  }

  async function buildStepOnePayload(titleValue) {
    return {
      application_type: "sitting_application",
      title: titleValue || projectName || "Draft Sitting Application",
      status: "draft",
      current_step: 1,
      form_data: {
        step_1: {
          status: "Draft",
          application_type: "Application for Site (New Site)",
          application_type_label: "Application for Site (New Site)",
          division: "",
          project_category: "",
          project_name: projectName,
          locality_address: localityAddress,
          area_required: areaRequired,
          area_unit: areaUnit,
          source_of_fund: sourceOfFund,
          fund_availability: fundAvailability,
          amount_fund_approved: amountFundApproved,

          map_address: mapData.address,
          latitude: mapData.latitude,
          longitude: mapData.longitude,

          site_image_name: siteImageName,
          site_image: siteImageAttachment,
          site_image_document_id: siteImageAttachment?.document_id || "",
          site_image_url: siteImageAttachment?.url || "",
          site_image_preview: siteImagePreview?.startsWith("blob:")
            ? ""
            : siteImagePreview,

          project_justification: projectJustification,
          site_selection_reason: siteSelectionReason,
        },
      },
    };
  }

  async function saveApplication(payload) {
    return apiRequest(
      applicationId ? `/applications/${applicationId}/` : "/applications/",
      {
        method: applicationId ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      }
    );
  }

  function handleLocalityAddressChange(nextAddress) {
    setLocalityAddress(nextAddress);
    setMapData((prev) => ({
      ...prev,
      address: nextAddress,
    }));
  }

  function handleMapDataChange(nextMapData) {
    setMapData(nextMapData);
    if (nextMapData?.address !== undefined) {
      setLocalityAddress(nextMapData.address || "");
    }
  }

  async function uploadPendingSiteImage(application, payload) {
    if (!siteImageFile) return application;

    const attachment = await uploadApplicationDocument(
      application.id,
      "Site Image",
      siteImageFile
    );
    const formData = application.form_data || payload.form_data || {};
    const step1 = formData.step_1 || payload.form_data?.step_1 || {};

    const updatedApplication = await apiRequest(`/applications/${application.id}/`, {
      method: "PATCH",
      body: JSON.stringify({
        form_data: {
          ...formData,
          step_1: {
            ...step1,
            site_image_name: attachment.name,
            site_image: attachment,
            site_image_document_id: attachment.document_id,
            site_image_url: attachment.url,
            site_image_preview: "",
          },
        },
      }),
    });

    setSiteImageAttachment(attachment);
    setSiteImageFile(null);
    setSiteImagePreview(attachment.url);

    return updatedApplication;
  }

  async function handleSave() {
    if (
      !projectName.trim() ||
      !localityAddress.trim() ||
      !areaRequired.trim() ||
      !amountFundApproved.trim()
    ) {
      alert(tx("requiredAlert"));
      return;
    }

    try {
      const payload = await buildStepOnePayload(projectName);
      const data = await saveApplication(payload);
      const savedData = await uploadPendingSiteImage(data, payload);

      navigate(`/admin/applications/${savedData.id}/step-2?id=${savedData.id}`);
    } catch (err) {
      console.error("Save failed:", err);
      alert(tx("failedSaveStep1"));
    }
  }

  async function handleSaveDraftAndBack() {
    const confirmSave = window.confirm(
      tx("draftConfirm")
    );

    if (!confirmSave) {
      navigate("/admin/applications");
      return;
    }

    try {
      const payload = await buildStepOnePayload(
        projectName || tx("draftSittingApplication")
      );
      const data = await saveApplication(payload);
      await uploadPendingSiteImage(data, payload);

      if (data?.id) {
        localStorage.setItem("current_application_id", String(data.id));
      }

      navigate("/admin/applications");
    } catch (err) {
      console.error("Draft save failed:", err);
      alert(tx("failedSaveDraft"));
    }
  }

  return (
    <Layout>
      <div className="flex gap-4">
        <AdminApplicationStepNav active={1} />

        <main className="flex-1 min-w-0">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="bg-[#18b36b] text-white text-sm font-bold px-3 py-1">
                1
              </span>
              <h1 className="text-lg font-semibold text-[#1a1c1c]">
                {tx("sittingApplication")}
              </h1>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSaveDraftAndBack}
                className="px-3 py-1.5 border border-slate-300 rounded text-xs font-semibold hover:bg-slate-50"
              >
                {tx("back")}
              </button>

              <button
                type="button"
                onClick={handleSave}
                className="px-3 py-1.5 bg-[#006d32] text-white rounded text-xs font-semibold hover:bg-[#005224]"
              >
                {tx("saveNext")}
              </button>
            </div>
          </div>

          <section className="bg-white border border-slate-200 rounded-sm overflow-hidden">
            <ApplicationReference language={language} />

            <div className="p-4 space-y-3">
              <FormSection title={tx("typeOfApplication")}>
                <Checkbox label={tx("applicationForSite")} checked />
              </FormSection>

              <Field label={tx("nameOfProject")} required>
                <input
                  className="spa-input"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                />
              </Field>

              <Field label={tx("localityAddress")} required>
                <input
                  className="spa-input"
                  value={localityAddress}
                  onChange={(e) => handleLocalityAddressChange(e.target.value)}
                />
              </Field>

              <LocationMap value={mapData} onChange={handleMapDataChange} language={language} />

              <SiteImageUpload
                imageName={siteImageName}
                preview={siteImagePreview}
                language={language}
                onChange={(data) => {
                  setSiteImageName(data.name);
                  setSiteImagePreview(data.preview);
                  setSiteImageFile(data.file);
                  setSiteImageAttachment(null);
                }}
                onRemove={() => {
                  setSiteImageName("");
                  setSiteImagePreview("");
                  setSiteImageFile(null);
                  setSiteImageAttachment(null);
                }}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label={tx("areaRequired")} required guideline={tx("areaRequiredGuideline")}>
                  <input
                    className="spa-input"
                    value={areaRequired}
                    onChange={(e) => setAreaRequired(e.target.value)}
                  />
                </Field>

              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label={tx("fundApprovedMalaysiaPlan")} required guideline={tx("fundApprovedMalaysiaPlanGuideline")}>
                  <input
                    className="spa-input"
                    value={amountFundApproved}
                    onChange={(e) => setAmountFundApproved(e.target.value)}
                  />
                </Field>
              </div>

              <SimpleWysiwygEditor
                key={`project-justification-${applicationId || "new"}`}
                label={tx("projectJustification")}
                value={projectJustification}
                onChange={setProjectJustification}
                max={3000}
              />

              <SimpleWysiwygEditor
                key={`site-selection-reason-${applicationId || "new"}`}
                label={tx("siteSelectionReason")}
                value={siteSelectionReason}
                onChange={setSiteSelectionReason}
                max={1500}
              />

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleSaveDraftAndBack}
                  className="px-3 py-1.5 border border-slate-300 rounded text-xs font-semibold hover:bg-slate-50"
                >
                  {tx("back")}
                </button>

                <button
                  type="button"
                  onClick={handleSave}
                  className="px-3 py-1.5 bg-[#006d32] text-white rounded text-xs font-semibold hover:bg-[#005224]"
                >
                  {tx("saveNext")}
                </button>
              </div>
            </div>
          </section>
        </main>
      </div>
    </Layout>
  );
}

function LocationMap({ value, onChange, language = "en" }) {
  const tx = (key) => stepText(language, key);
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const debounceRef = useRef(null);

  const defaultLng = 110.334028;
  const defaultLat = 1.586684;

  const [lng, setLng] = useState(value?.longitude || defaultLng);
  const [lat, setLat] = useState(value?.latitude || defaultLat);
  const [address, setAddress] = useState(value?.address || "");
  const [suggestions, setSuggestions] = useState([]);
  const [mode, setMode] = useState("2d");
  const [scene, setScene] = useState("street");
  const [loadingAddress, setLoadingAddress] = useState(false);
  const [searching, setSearching] = useState(false);

  const styles = {
    street: "mapbox://styles/mapbox/streets-v12",
    satellite: "mapbox://styles/mapbox/satellite-streets-v12",
    outdoor: "mapbox://styles/mapbox/outdoors-v12",
  };

  useEffect(() => {
    const nextLng = Number(value?.longitude || defaultLng);
    const nextLat = Number(value?.latitude || defaultLat);
    const nextAddress = value?.address ?? address;

    setLng(nextLng);
    setLat(nextLat);
    setAddress(nextAddress);

    markerRef.current?.setLngLat([nextLng, nextLat]);
    mapRef.current?.setCenter([nextLng, nextLat]);
  }, [value?.longitude, value?.latitude, value?.address]);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: styles.street,
      center: [lng, lat],
      zoom: 16,
      pitch: 0,
      bearing: 0,
    });

    mapRef.current = map;

    map.addControl(
      new mapboxgl.NavigationControl({
        visualizePitch: true,
      }),
      "top-right"
    );

    markerRef.current = new mapboxgl.Marker({
      color: "#dc2626",
      draggable: true,
    })
      .setLngLat([lng, lat])
      .addTo(map);

    markerRef.current.on("dragend", () => {
      const position = markerRef.current.getLngLat();
      updateLocationFromCoordinates(position.lng, position.lat, true);
    });

    map.on("click", (event) => {
      updateLocationFromCoordinates(event.lngLat.lng, event.lngLat.lat, true);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  function pushChange(nextAddress, nextLat, nextLng) {
    onChange?.({
      address: nextAddress,
      latitude: nextLat,
      longitude: nextLng,
    });
  }

  async function reverseGeocode(nextLng, nextLat) {
    try {
      setLoadingAddress(true);

      const url =
        `https://nominatim.openstreetmap.org/reverse` +
        `?lat=${nextLat}&lon=${nextLng}` +
        `&format=json` +
        `&addressdetails=1` +
        `&zoom=18`;

      const response = await fetch(url, {
        headers: { "Accept-Language": "en", "User-Agent": "SittingApp/1.0" },
      });
      const data = await response.json();

      if (data && (data.display_name || data.address)) {
        const addr = data.address || {};
        const buildingName =
          data.name ||
          addr.building ||
          addr.amenity ||
          addr.shop ||
          addr.office ||
          addr.tourism ||
          "";
        const road = addr.road || addr.pedestrian || addr.footway || "";
        const suburb = addr.suburb || addr.neighbourhood || addr.quarter || "";
        const city = addr.city || addr.town || addr.village || addr.county || "";
        const state = addr.state || "";

        const parts = [
          buildingName,
          road,
          suburb,
          city,
          state,
          "Malaysia",
        ].filter(Boolean);

        const nextAddress = parts.join(", ") || data.display_name;

        setAddress(nextAddress);
        pushChange(nextAddress, nextLat, nextLng);
      }
    } catch (error) {
      console.error("Reverse geocoding failed:", error);
    } finally {
      setLoadingAddress(false);
    }
  }

  function updateLocationFromCoordinates(nextLng, nextLat, shouldReverse = false) {
    const fixedLng = Number(nextLng.toFixed(6));
    const fixedLat = Number(nextLat.toFixed(6));

    setLng(fixedLng);
    setLat(fixedLat);

    markerRef.current?.setLngLat([fixedLng, fixedLat]);

    mapRef.current?.easeTo({
      center: [fixedLng, fixedLat],
      zoom: Math.max(mapRef.current.getZoom(), 16),
      duration: 500,
    });

    if (shouldReverse) {
      reverseGeocode(fixedLng, fixedLat);
    } else {
      pushChange(address, fixedLat, fixedLng);
    }
  }

  async function fetchGeocodeResults(url) {
    const response = await fetch(url);
    const data = await response.json();
    return (data?.features || []).map((feature) => ({
      id: feature.id,
      text: feature.text || feature.place_name?.split(",")[0] || "",
      place_name: feature.place_name || "",
      center: feature.geometry?.coordinates || feature.center,
    }));
  }

  async function fetchNominatimResults(keyword) {
    const url =
      `https://nominatim.openstreetmap.org/search` +
      `?q=${encodeURIComponent(keyword)}` +
      `&format=json` +
      `&addressdetails=1` +
      `&limit=8` +
      `&countrycodes=my` +
      `&viewbox=109.7,2.2,111.2,0.8` +
      `&bounded=0`;

    const response = await fetch(url, {
      headers: { "Accept-Language": "en", "User-Agent": "SittingApp/1.0" },
    });
    const data = await response.json();

    return data.map((item) => {
      const addr = item.address || {};
      const buildingName =
        addr.building ||
        addr.amenity ||
        addr.shop ||
        addr.office ||
        addr.tourism ||
        "";
      const road = addr.road || addr.pedestrian || addr.footway || "";
      const suburb = addr.suburb || addr.neighbourhood || addr.quarter || "";
      const city = addr.city || addr.town || addr.village || addr.county || "";
      const state = addr.state || "";

      const shortLabel =
        buildingName || road || item.name || item.display_name.split(",")[0];

      const fullLabel = [
        buildingName,
        road,
        suburb,
        city,
        state,
        "Malaysia",
      ]
        .filter(Boolean)
        .join(", ");

      return {
        id: item.place_id,
        text: shortLabel,
        place_name: fullLabel || item.display_name,
        center: [parseFloat(item.lon), parseFloat(item.lat)],
      };
    });
  }

  async function searchAddress(keyword) {
    const cleanKeyword = keyword.trim();

    if (!cleanKeyword || cleanKeyword.length < 3) {
      setSuggestions([]);
      return;
    }

    try {
      setSearching(true);

      let results = await fetchNominatimResults(cleanKeyword);

      if (results.length === 0) {
        const encodedKuchingQuery = encodeURIComponent(
          `${cleanKeyword}, Kuching, Sarawak, Malaysia`
        );

        const kuchingUrl =
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedKuchingQuery}.json` +
          `?access_token=${MAPBOX_TOKEN}` +
          `&language=en` +
          `&country=my` +
          `&limit=8` +
          `&proximity=110.334028,1.586684` +
          `&bbox=109.7,0.8,111.2,2.2`;

        results = await fetchGeocodeResults(kuchingUrl);
      }

      if (results.length === 0) {
        const encodedMalaysiaQuery = encodeURIComponent(
          `${cleanKeyword}, Malaysia`
        );

        const malaysiaUrl =
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedMalaysiaQuery}.json` +
          `?access_token=${MAPBOX_TOKEN}` +
          `&language=en` +
          `&country=my` +
          `&limit=8` +
          `&proximity=110.334028,1.586684`;

        results = await fetchGeocodeResults(malaysiaUrl);
      }

      setSuggestions(results);
    } catch (error) {
      console.error("Address search failed:", error);
      setSuggestions([]);
    } finally {
      setSearching(false);
    }
  }

  function handleAddressChange(event) {
    const nextAddress = event.target.value;
    setAddress(nextAddress);
    pushChange(nextAddress, lat, lng);

    window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      searchAddress(nextAddress);
    }, 350);
  }

  function selectSuggestion(place) {
    const [selectedLng, selectedLat] = place.center;

    setAddress(place.place_name);
    setSuggestions([]);

    const fixedLng = Number(selectedLng.toFixed(6));
    const fixedLat = Number(selectedLat.toFixed(6));

    setLng(fixedLng);
    setLat(fixedLat);

    markerRef.current?.setLngLat([fixedLng, fixedLat]);
    mapRef.current?.easeTo({
      center: [fixedLng, fixedLat],
      zoom: 16,
      duration: 500,
    });

    pushChange(place.place_name, fixedLat, fixedLng);
  }

  function apply2D() {
    setMode("2d");

    mapRef.current?.easeTo({
      pitch: 0,
      bearing: 0,
      duration: 700,
    });
  }

  function apply3D() {
    setMode("3d");

    mapRef.current?.easeTo({
      pitch: 60,
      bearing: -25,
      duration: 700,
    });
  }

  function focusLocation() {
    if (!mapRef.current) return;
    mapRef.current.flyTo({
      center: [lng, lat],
      zoom: 17,
      pitch: mode === "3d" ? 60 : 0,
      bearing: mode === "3d" ? -25 : 0,
      duration: 900,
    });
  }

  function changeScene(nextScene) {
    setScene(nextScene);

    if (mapRef.current) {
      mapRef.current.setStyle(styles[nextScene]);
    }
  }

  return (
    <FormSection title={tx("locationMap")}>
      <div className="space-y-3">
        <div>
          <Field label={tx("projectAddressSearch")}>
            <div className="relative">
              <input
                className="spa-input"
                value={address}
                onChange={handleAddressChange}
                placeholder={tx("addressSearchPlaceholder")}
              />

              {(suggestions.length > 0 || searching) && (
                <div className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded border border-slate-200 bg-white shadow-lg">
                  {searching && (
                    <div className="px-3 py-2 text-xs text-slate-500">
                      {tx("searchingAddress")}
                    </div>
                  )}

                  {!searching &&
                    suggestions.map((place) => (
                      <button
                        key={place.id}
                        type="button"
                        onClick={() => selectSuggestion(place)}
                        className="block w-full border-b border-slate-100 px-3 py-2 text-left text-xs hover:bg-[#f1f5f4]"
                      >
                        <span className="font-semibold text-slate-800">
                          {place.text}
                        </span>
                        <span className="block text-[11px] text-slate-500">
                          {place.place_name}
                        </span>
                      </button>
                    ))}
                </div>
              )}
            </div>
          </Field>

          <p className="mt-1 text-[11px] text-slate-500">
            {tx("addressSearchHelp")}
          </p>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-700">
              {tx("pinpointLocation")}
            </p>
            <p className="text-[11px] text-slate-500">
              {tx("pinpointHelp")}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={focusLocation}
              title={tx("flyBackTitle")}
              className="px-3 py-1.5 rounded text-[11px] font-bold border bg-white text-slate-700 border-slate-300 hover:bg-slate-50 flex items-center gap-1"
            >
              {tx("focus")}
            </button>

            <span className="border-l border-slate-200 self-stretch" />
            <button
              type="button"
              onClick={apply2D}
              className={`px-3 py-1.5 rounded text-[11px] font-bold border ${
                mode === "2d"
                  ? "bg-[#006d32] text-white border-[#006d32]"
                  : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
              }`}
            >
              2D
            </button>

            <button
              type="button"
              onClick={apply3D}
              className={`px-3 py-1.5 rounded text-[11px] font-bold border ${
                mode === "3d"
                  ? "bg-[#006d32] text-white border-[#006d32]"
                  : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
              }`}
            >
              3D
            </button>

            <button
              type="button"
              onClick={() => changeScene("street")}
              className={`px-3 py-1.5 rounded text-[11px] font-bold border ${
                scene === "street"
                  ? "bg-[#18b36b] text-white border-[#18b36b]"
                  : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
              }`}
            >
              {tx("street")}
            </button>

            <button
              type="button"
              onClick={() => changeScene("satellite")}
              className={`px-3 py-1.5 rounded text-[11px] font-bold border ${
                scene === "satellite"
                  ? "bg-[#18b36b] text-white border-[#18b36b]"
                  : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
              }`}
            >
              {tx("satellite")}
            </button>

            <button
              type="button"
              onClick={() => changeScene("outdoor")}
              className={`px-3 py-1.5 rounded text-[11px] font-bold border ${
                scene === "outdoor"
                  ? "bg-[#18b36b] text-white border-[#18b36b]"
                  : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
              }`}
            >
              {tx("outdoor")}
            </button>
          </div>
        </div>

        <div
          ref={mapContainer}
          className="h-[380px] w-full overflow-hidden rounded-md border border-slate-300"
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label={tx("latitude")}>
            <input className="spa-input bg-slate-50" value={lat} readOnly />
          </Field>

          <Field label={tx("longitude")}>
            <input className="spa-input bg-slate-50" value={lng} readOnly />
          </Field>
        </div>

        {loadingAddress && (
          <p className="text-[11px] text-slate-500">{tx("updatingAddress")}</p>
        )}
      </div>
    </FormSection>
  );
}

function SiteImageUpload({
  imageName,
  preview,
  language = "en",
  onChange,
  onRemove,
}) {
  const tx = (key) => stepText(language, key);
  const [remotePreview, setRemotePreview] = useState({
    source: "",
    url: "",
    error: false,
  });
  const isInlinePreview =
    typeof preview === "string" &&
    (preview.startsWith("blob:") || preview.startsWith("data:"));
  const displayPreview = isInlinePreview
    ? preview
    : remotePreview.source === preview
      ? remotePreview.url
      : "";
  const imageError =
    Boolean(preview) &&
    !isInlinePreview &&
    remotePreview.source === preview &&
    remotePreview.error;

  useEffect(() => {
    let isActive = true;
    let objectUrl = "";

    if (!preview || isInlinePreview) {
      return undefined;
    }

    fetchAuthenticatedBlob(preview)
      .then((blob) => {
        if (!isActive) return;
        objectUrl = URL.createObjectURL(blob);
        setRemotePreview({ source: preview, url: objectUrl, error: false });
      })
      .catch((error) => {
        console.error("Failed to load site image preview:", error);
        if (isActive) {
          setRemotePreview({ source: preview, url: "", error: true });
        }
      });

    return () => {
      isActive = false;

      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [isInlinePreview, preview]);

  function handleFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;

    onChange?.({
      name: file.name,
      preview: URL.createObjectURL(file),
      file,
    });
  }

  return (
    <FormSection title={tx("siteImage")}>
      <div className="space-y-3">
        {!preview && (
          <div className="flex items-center justify-center border-2 border-dashed border-slate-300 rounded-md h-[160px] bg-slate-50">
            <label className="text-center cursor-pointer">
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />

              <div className="flex flex-col items-center gap-2">
                <span className="material-symbols-outlined text-3xl text-slate-400">
                  upload
                </span>
                <p className="text-xs font-semibold text-slate-600">
                  {tx("clickUploadSiteImage")}
                </p>
                <p className="text-[11px] text-slate-400">{tx("imageOnly")}</p>
              </div>
            </label>
          </div>
        )}

        {preview && (
          <div className="border border-slate-200 rounded-md overflow-hidden">
            <div className="relative">
              {displayPreview ? (
                <img
                  src={displayPreview}
                  alt="Site Preview"
                  className="w-full max-h-[420px] object-contain bg-slate-100"
                />
              ) : (
                <div className="flex h-[160px] items-center justify-center bg-slate-100 px-4 text-center text-xs font-semibold text-slate-500">
                  {imageError ? "Site image could not be loaded." : "Loading site image..."}
                </div>
              )}

              <button
                type="button"
                onClick={onRemove}
                className="absolute top-2 right-2 bg-red-500 text-white text-xs px-2 py-1 rounded hover:bg-red-600"
              >
                {tx("remove")}
              </button>
            </div>

            <div className="flex justify-between items-center px-3 py-2 text-xs bg-[#f7f7f7] border-t">
              <span className="text-slate-600 truncate max-w-[70%]">
                {imageName}
              </span>

              <label className="text-[#006d32] font-semibold cursor-pointer hover:underline">
                {tx("replace")}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        )}

        <p className="text-[11px] text-slate-500">
          {tx("siteImageHelp")}
        </p>
      </div>
    </FormSection>
  );
}

function ApplicationReference({ language = "en" }) {
  const storedUser = localStorage.getItem("fastrack_user");
  const user = storedUser ? JSON.parse(storedUser) : null;
  const tx = (key) => stepText(language, key);

  return (
    <div className="bg-[#f5f5f5] border-b border-slate-200 px-4 py-3 text-xs">
      <div className="grid grid-cols-[140px_1fr] gap-y-1">
        {user?.role !== "applicant" && (
          <>
            <p>{tx("digitalReference")}</p>
            <p className="font-semibold text-[#006d32]">E.SPA.2025-1443</p>

            <p>{tx("agencyReference")}</p>
            <p className="font-semibold text-[#006d32]">SP/1D/159/2024</p>

          </>
        )}

        <p>{tx("status")}</p>
        <p className="font-semibold text-[#006d32]">
          {applicationStatusLabel(language, "Draft")}
        </p>

        <p>{tx("applicationType")}</p>
        <p className="font-semibold text-[#006d32]">
          {applicationTypeLabel(language, "Application of Siting Project")}
        </p>
      </div>
    </div>
  );
}

function FormSection({ title, children }) {
  return (
    <section className="border border-slate-200 rounded-sm overflow-hidden">
      <div className="bg-[#f7f7f7] border-b px-3 py-2">
        <h2 className="text-xs font-bold text-slate-700">{title}</h2>
      </div>

      <div className="p-3">{children}</div>
    </section>
  );
}

function Field({ label, children, required = false, guideline = "" }) {
  return (
    <div className="relative">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-slate-700">
        <span>
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </span>
        {guideline && <GuidelineHint text={guideline} />}
      </div>

      {children}
    </div>
  );
}

function GuidelineHint({ text }) {
  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={text}
      className="group/icon inline-flex h-4 w-4 shrink-0 cursor-help items-center justify-center rounded-full border border-slate-400 bg-white text-[10px] font-black leading-none text-slate-600 outline-none hover:border-[#006d32] hover:text-[#006d32] focus:border-[#006d32] focus:text-[#006d32]"
    >
      i
      <span className="pointer-events-none absolute left-0 top-5 z-40 hidden w-[min(18rem,calc(100vw-2rem))] rounded border border-slate-200 bg-white px-3 py-2 text-left text-[11px] font-medium leading-4 text-slate-700 shadow-lg group-hover/icon:block group-focus/icon:block">
        {text}
      </span>
    </span>
  );
}

function Checkbox({ label, checked = false }) {
  return (
    <label className="flex items-center gap-2">
      <input type="checkbox" defaultChecked={checked} />
      <span>{label}</span>
    </label>
  );
}

export default AdminStep1Page;

