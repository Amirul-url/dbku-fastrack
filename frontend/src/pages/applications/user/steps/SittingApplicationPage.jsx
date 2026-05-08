import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import UserDashboardLayout from "../../../../layout/UserDashboardLayout";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { apiRequest } from "../../../../services/api";
import UserApplicationStepNav from "../UserApplicationStepNav";
import SimpleWysiwygEditor from "../../../../components/SimpleWysiwygEditor";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || "YOUR_MAPBOX_TOKEN";
mapboxgl.accessToken = MAPBOX_TOKEN;

function SittingApplicationPage({
  LayoutComponent = UserDashboardLayout,
  StepNavComponent = UserApplicationStepNav,
  mode = "user",
} = {}) {
  const Layout = LayoutComponent;
  const StepNav = StepNavComponent;
  const isAdminReview = mode === "admin";

  const navigate = useNavigate();
  const location = useLocation();
  const { applicationId: routeApplicationId } = useParams();
  const queryParams = new URLSearchParams(location.search);

  const applicationIdRaw =
    routeApplicationId || location.state?.applicationId || queryParams.get("id");

  const applicationId = applicationIdRaw ? Number(applicationIdRaw) : null;

  const [projectName, setProjectName] = useState("");
  const [applicant, setApplicant] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [telNo, setTelNo] = useState("");
  const [localityAddress, setLocalityAddress] = useState("");
  const [areaRequired, setAreaRequired] = useState("");
  const [totalSchemeValue, setTotalSchemeValue] = useState("");
  const [malaysiaPlan, setMalaysiaPlan] = useState("");
  const [amountFundApproved, setAmountFundApproved] = useState("");
  const [amountFundAvailable, setAmountFundAvailable] = useState("");
  const [projectJustification, setProjectJustification] = useState("");
  const [siteSelectionReason, setSiteSelectionReason] = useState("");
  const [designation, setDesignation] = useState("");
  const [officerName, setOfficerName] = useState("");
  const [applicationDate, setApplicationDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );

  const [siteImageName, setSiteImageName] = useState("");
  const [siteImagePreview, setSiteImagePreview] = useState("");

  const [mapData, setMapData] = useState({
    address:
      "Muzium Kucing, Jalan Semariang, Petra Jaya, Kuching, Sarawak, Malaysia",
    latitude: 1.586684,
    longitude: 110.334028,
  });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability
    if (applicationId) loadDraft();
  }, [applicationId]);

  async function loadDraft() {
    try {
      const data = await apiRequest(`/applications/${applicationId}/`);
      const step1 = data.form_data?.step_1 || {};

      setProjectName(step1.project_name || "");
      setApplicant(step1.applicant || "");
      setContactPerson(step1.contact_person || "");
      setTelNo(step1.tel_no || "");
      setLocalityAddress(step1.locality_address || "");
      setAreaRequired(step1.area_required || "");
      setTotalSchemeValue(step1.total_scheme_value || "");
      setMalaysiaPlan(step1.malaysia_plan || "");
      setAmountFundApproved(step1.amount_fund_approved || "");
      setAmountFundAvailable(step1.amount_fund_available || "");
      setProjectJustification(step1.project_justification || "");
      setSiteSelectionReason(step1.site_selection_reason || "");
      setDesignation(step1.designation || "");
      setOfficerName(step1.officer_name || "");
      setApplicationDate(step1.application_date || new Date().toISOString().slice(0, 10));

      setSiteImageName(step1.site_image_name || "");
      setSiteImagePreview(step1.site_image_preview || "");

      setMapData({
        address: step1.map_address || step1.locality_address || "",
        latitude: Number(step1.latitude || 1.586684),
        longitude: Number(step1.longitude || 110.334028),
      });
    } catch (err) {
      console.error("Failed to load draft:", err);
    }
  }

  async function buildStepOnePayload(titleValue) {
    let existingFormData = {};

    if (applicationId) {
      try {
        const existingData = await apiRequest(`/applications/${applicationId}/`);
        existingFormData = existingData.form_data || {};
      } catch (err) {
        console.error("Failed to load existing form data:", err);
      }
    }

    return {
      application_type: "sitting_application",
      title: titleValue,
      current_step: 1,
      form_data: {
        ...existingFormData,
        step_1: {
          status: "Prepare Case",
          application_type: "Application for Site (New Site)",
          application_type_label: "Application for Site (New Site)",
          division: "",
          project_category: "",
          project_name: projectName,
          applicant,
          contact_person: contactPerson,
          tel_no: telNo,
          locality_address: localityAddress,
          area_required: areaRequired,
          area_unit: "",
          total_scheme_value: totalSchemeValue,
          source_of_fund: "",
          fund_availability: "",
          malaysia_plan: malaysiaPlan,
          amount_fund_available: amountFundAvailable,
          amount_fund_approved: amountFundApproved,

          map_address: mapData.address,
          latitude: mapData.latitude,
          longitude: mapData.longitude,

          site_image_name: siteImageName,
          site_image_preview: siteImagePreview,

          project_justification: projectJustification,
          site_selection_reason: siteSelectionReason,
          designation,
          officer_name: officerName,
          application_date: applicationDate,
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

  async function handleSave() {
    if (
      !projectName.trim() ||
      !applicant.trim() ||
      !contactPerson.trim() ||
      !telNo.trim() ||
      !localityAddress.trim() ||
      !areaRequired.trim() ||
      !totalSchemeValue.trim() ||
      !amountFundApproved.trim() ||
      !amountFundAvailable.trim() ||
      !projectJustification.trim() ||
      !siteSelectionReason.trim() ||
      !designation.trim() ||
      !officerName.trim() ||
      !applicationDate
    ) {
      alert("Please fill in all required fields before proceeding to the next step.");
      return;
    }

    try {
      const payload = await buildStepOnePayload(projectName);
      const data = await saveApplication(payload);

      navigate(
        isAdminReview
          ? `/admin/applications/${data.id}/step-2?id=${data.id}`
          : `/applications/${data.id}/submitting-person?id=${data.id}`
      );
    } catch (err) {
      console.error("Save failed:", err);
      alert("Failed to save Step 1. Please try again.");
    }
  }

  async function handleSaveDraftAndBack() {
    const confirmSave = window.confirm(
      "You have unsaved changes. Save this application as draft before leaving?"
    );

    if (!confirmSave) {
      navigate(isAdminReview ? "/admin/applications" : "/user/dashboard");
      return;
    }

    try {
      const payload = await buildStepOnePayload(
        projectName || "Draft Sitting Application"
      );
      await saveApplication(payload);

      navigate(isAdminReview ? "/admin/applications" : "/user/dashboard");
    } catch (err) {
      console.error("Draft save failed:", err);
      alert("Failed to save draft.");
    }
  }

  return (
    <Layout>
      <div className="flex gap-4">
        <StepNav active={1} />

        <main className="flex-1 min-w-0">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="bg-[#18b36b] text-white text-sm font-bold px-3 py-1">
                1
              </span>
              <h1 className="text-lg font-semibold text-[#1a1c1c]">
                Sitting Application
              </h1>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSaveDraftAndBack}
                className="px-3 py-1.5 border border-slate-300 rounded text-xs font-semibold hover:bg-slate-50"
              >
                Back
              </button>

              <button
                type="button"
                onClick={handleSave}
                className="px-3 py-1.5 bg-[#006d32] text-white rounded text-xs font-semibold hover:bg-[#005224]"
              >
                Save & Next
              </button>
            </div>
          </div>

          <section className="bg-white border border-slate-200 rounded-sm overflow-hidden">
            <ApplicationReference />

            <div className="p-4 space-y-3">
              <FormSection title="Type of Application">
                <Checkbox label="Application for Site (New Site)" checked />
              </FormSection>

              <Field label="Name of Project" required>
                <input
                  className="spa-input"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                />
              </Field>

              <Field label="Applicant" required>
                <input
                  className="spa-input"
                  value={applicant}
                  onChange={(e) => setApplicant(e.target.value)}
                />
              </Field>

              <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_220px] gap-3">
                <Field label="Contact Person" required>
                  <input
                    className="spa-input"
                    value={contactPerson}
                    onChange={(e) => setContactPerson(e.target.value)}
                  />
                </Field>

                <Field label="Tel No." required>
                  <input
                    className="spa-input"
                    value={telNo}
                    onChange={(e) => setTelNo(e.target.value)}
                  />
                </Field>
              </div>

              <Field label="Locality / Address" required>
                <input
                  className="spa-input"
                  value={localityAddress}
                  onChange={(e) => {
                    setLocalityAddress(e.target.value);
                    setMapData((prev) => ({
                      ...prev,
                      address: e.target.value,
                    }));
                  }}
                />
              </Field>

              <LocationMap value={mapData} onChange={setMapData} />

              <SiteImageUpload
                imageName={siteImageName}
                preview={siteImagePreview}
                onChange={(data) => {
                  setSiteImageName(data.name);
                  setSiteImagePreview(data.preview);
                }}
                onRemove={() => {
                  setSiteImageName("");
                  setSiteImagePreview("");
                }}
              />

              <Field label="Area Required" required>
                <input
                  className="spa-input"
                  value={areaRequired}
                  onChange={(e) => setAreaRequired(e.target.value)}
                />
              </Field>

              <Field label="Total Scheme Value, RM" required>
                <input
                  className="spa-input"
                  value={totalSchemeValue}
                  onChange={(e) => setTotalSchemeValue(e.target.value)}
                />
              </Field>

              <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_220px] gap-3">
                <Field label="Amount of fund approved in the" required>
                  <input
                    className="spa-input"
                    value={malaysiaPlan}
                    onChange={(e) => setMalaysiaPlan(e.target.value)}
                    placeholder="Malaysia Plan"
                  />
                </Field>

                <Field label="Malaysia Plan, RM" required>
                  <input
                    className="spa-input"
                    value={amountFundApproved}
                    onChange={(e) => setAmountFundApproved(e.target.value)}
                  />
                </Field>
              </div>

              <Field label="Amount of fund available now, RM" required>
                <input
                  className="spa-input"
                  value={amountFundAvailable}
                  onChange={(e) => setAmountFundAvailable(e.target.value)}
                />
              </Field>

              <SimpleWysiwygEditor
                key={`project-justification-${applicationId || "new"}`}
                label="Project Justification and Description on Project Components"
                value={projectJustification}
                onChange={setProjectJustification}
                max={3000}
              />

              <p className="-mt-2 text-[11px] italic text-slate-500">
                Project brief to be submitted, together with conceptual site
                layout plan if available; additional sheet to be attached if
                insufficient space.
              </p>

              <SimpleWysiwygEditor
                key={`site-selection-reason-${applicationId || "new"}`}
                label="Reason for Selecting the Site"
                value={siteSelectionReason}
                onChange={setSiteSelectionReason}
                max={1500}
              />

              <p className="-mt-2 text-[11px] italic text-slate-500">
                Additional sheet to be attached if insufficient space.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Designation" required>
                  <input
                    className="spa-input"
                    value={designation}
                    onChange={(e) => setDesignation(e.target.value)}
                  />
                </Field>

                <Field label="Name of Officer" required>
                  <input
                    className="spa-input"
                    value={officerName}
                    onChange={(e) => setOfficerName(e.target.value)}
                  />
                </Field>

                <Field label="Date" required>
                  <input
                    type="date"
                    className="spa-input"
                    value={applicationDate}
                    onChange={(e) => setApplicationDate(e.target.value)}
                  />
                </Field>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleSaveDraftAndBack}
                  className="px-3 py-1.5 border border-slate-300 rounded text-xs font-semibold hover:bg-slate-50"
                >
                  Back
                </button>

                <button
                  type="button"
                  onClick={handleSave}
                  className="px-3 py-1.5 bg-[#006d32] text-white rounded text-xs font-semibold hover:bg-[#005224]"
                >
                  Save & Next
                </button>
              </div>
            </div>
          </section>
        </main>
      </div>
    </Layout>
  );
}

function LocationMap({ value, onChange }) {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const debounceRef = useRef(null);

  const defaultLng = 110.334028;
  const defaultLat = 1.586684;

  const [lng, setLng] = useState(value?.longitude || defaultLng);
  const [lat, setLat] = useState(value?.latitude || defaultLat);
  const [address, setAddress] = useState(
    value?.address ||
      "Muzium Kucing, Jalan Semariang, Petra Jaya, Kuching, Sarawak, Malaysia"
  );
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
    const nextAddress = value?.address || address;

    // eslint-disable-next-line react-hooks/set-state-in-effect
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
      // eslint-disable-next-line react-hooks/immutability
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
    <FormSection title="Location Map">
      <div className="space-y-3">
        <div>
          <Field label="Project Address / Location Search (Selected Address)">
            <div className="relative">
              <input
                className="spa-input"
                value={address}
                onChange={handleAddressChange}
                placeholder="Search building name, road, lot number or landmark in Malaysia..."
              />

              {(suggestions.length > 0 || searching) && (
                <div className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded border border-slate-200 bg-white shadow-lg">
                  {searching && (
                    <div className="px-3 py-2 text-xs text-slate-500">
                      Searching address...
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
            Search by building name, road, lot number or landmark across
            Malaysia. The selected result will be used as the project address.
            You may also drag the pin or click the map to update the address
            automatically.
          </p>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-700">
              Pinpoint Project Location
            </p>
            <p className="text-[11px] text-slate-500">
              Drag the red pin or click the map to update address, latitude, and
              longitude.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={focusLocation}
              title="Fly back to pinned location"
              className="px-3 py-1.5 rounded text-[11px] font-bold border bg-white text-slate-700 border-slate-300 hover:bg-slate-50 flex items-center gap-1"
            >
              Focus
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
              Street
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
              Satellite
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
              Outdoor
            </button>
          </div>
        </div>

        <div
          ref={mapContainer}
          className="h-[380px] w-full overflow-hidden rounded-md border border-slate-300"
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Latitude">
            <input className="spa-input bg-slate-50" value={lat} readOnly />
          </Field>

          <Field label="Longitude">
            <input className="spa-input bg-slate-50" value={lng} readOnly />
          </Field>
        </div>

        {loadingAddress && (
          <p className="text-[11px] text-slate-500">Updating address...</p>
        )}
      </div>
    </FormSection>
  );
}

function SiteImageUpload({ imageName, preview, onChange, onRemove }) {
  function handleFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onloadend = () => {
      onChange?.({
        name: file.name,
        preview: reader.result,
      });
    };

    reader.readAsDataURL(file);
  }

  return (
    <FormSection title="Site Image">
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
                  Click to upload site image
                </p>
                <p className="text-[11px] text-slate-400">JPG / PNG only</p>
              </div>
            </label>
          </div>
        )}

        {preview && (
          <div className="border border-slate-200 rounded-md overflow-hidden">
            <div className="relative">
              <img
                src={preview}
                alt="Site Preview"
                className="w-full max-h-[420px] object-contain bg-slate-100"
              />

              <button
                type="button"
                onClick={onRemove}
                className="absolute top-2 right-2 bg-red-500 text-white text-xs px-2 py-1 rounded hover:bg-red-600"
              >
                Remove
              </button>
            </div>

            <div className="flex justify-between items-center px-3 py-2 text-xs bg-[#f7f7f7] border-t">
              <span className="text-slate-600 truncate max-w-[70%]">
                {imageName}
              </span>

              <label className="text-[#006d32] font-semibold cursor-pointer hover:underline">
                Replace
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
          Upload actual site photo for verification. This helps officer validate
          location and condition of the site.
        </p>
      </div>
    </FormSection>
  );
}

function ApplicationReference() {
  const storedUser = localStorage.getItem("fastrack_user");
  const user = storedUser ? JSON.parse(storedUser) : null;

  return (
    <div className="bg-[#f5f5f5] border-b border-slate-200 px-4 py-3 text-xs">
      <div className="grid grid-cols-[140px_1fr] gap-y-1">
        {user?.role !== "applicant" && (
          <>
            <p>Digital Reference</p>
            <p className="font-semibold text-[#006d32]">E.SPA.2025-1443</p>

            <p>Agency Reference</p>
            <p className="font-semibold text-[#006d32]">SP/1D/159/2024</p>

            <p>Division</p>
            <p className="font-semibold text-[#006d32]">KUCHING</p>
          </>
        )}

        <p>Status</p>
        <p className="font-semibold text-[#006d32]">Prepare Case</p>

        <p>Application Type</p>
        <p className="font-semibold text-[#006d32]">
          Application for Site (New Site)
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

function Field({ label, children, required = false }) {
  return (
    <div>
      <label className="block text-[11px] font-bold text-slate-700 mb-1">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>

      {children}
    </div>
  );
}

function Checkbox({ label, checked = false }) {
  return (
    <label className="flex items-center gap-2">
      <input type="checkbox" checked={checked} readOnly />
      <span>{label}</span>
    </label>
  );
}

export default SittingApplicationPage;
