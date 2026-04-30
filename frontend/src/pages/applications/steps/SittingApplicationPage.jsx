import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import DashboardLayout from "../../../layout/DashboardLayout";
import { Link } from "react-router-dom";
import ApplicationStepNav from "../../../components/ApplicationStepNav";
import SimpleWysiwygEditor from "../../../components/SimpleWysiwygEditor";

const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY || "YOUR_MAPTILER_KEY";

function SittingApplicationPage() {
  return (
    <DashboardLayout>
      <div className="flex gap-5">
        <ApplicationStepNav active={1} />

        <main className="flex-1 min-w-0">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="bg-[#18b36b] text-white text-sm font-bold px-3 py-1">
                1
              </span>
              <h1 className="text-xl font-semibold text-[#1a1c1c]">
                Sitting Application
              </h1>
            </div>

            <div className="flex gap-2">
              <Link
                to="/applications"
                className="px-3 py-1.5 border border-slate-300 rounded text-xs font-semibold hover:bg-slate-50"
              >
                ← Back
              </Link>

              <Link
                to="/applications/client-department"
                className="px-3 py-1.5 bg-[#006d32] text-white rounded text-xs font-semibold hover:bg-[#005224]"
              >
                Save & Next
              </Link>
            </div>
          </div>

          <section className="bg-white border border-slate-200 rounded-sm overflow-hidden">
            <ApplicationReference />

            <div className="p-4 space-y-3">
              <FormSection title="Type of Application">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                  <Checkbox label="Application for Site (New Site)" checked />
                  <Checkbox label="Submission of Detailed Building Plan" />
                  <Checkbox label="Site Legalisation (Permit / Tapak Sedia)" />
                  <Checkbox label="Road / Access / Water Alignment / Transmission Line" />
                  <Checkbox label="Application for Site Extension" />
                  <Checkbox label="Communication Tower / Structure" />
                  <Checkbox label="Temporary Change of Use" />
                  <Checkbox label="Other" />
                </div>
              </FormSection>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Division" required>
                  <select className="spa-input">
                    <option>-- Please Select --</option>
                    <option>KUCHING</option>
                  </select>
                </Field>

                <Field label="Project Category" required>
                  <select className="spa-input">
                    <option>STATE</option>
                    <option>PRIVATE</option>
                    <option>FEDERAL</option>
                  </select>
                </Field>
              </div>

              <Field label="Name of Project" required>
                <input
                  className="spa-input"
                  defaultValue='PERTAPAKAN PEMASANGAN PAPAN IKLAN UNTUK "BORNEO FRESH PORK"'
                />
              </Field>

              <Field label="Locality / Address" required>
                <input
                  className="spa-input"
                  defaultValue="Muzium Kucing, Jalan Semariang, Petra Jaya, Kuching, Sarawak, Malaysia"
                />
              </Field>

              <LocationMap />
              <SiteImageUpload />

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Field label="Area Required" required>
                  <input className="spa-input" defaultValue="7.0000" />
                </Field>

                <Field label="Area Unit" required>
                  <select className="spa-input">
                    <option>Sq. M</option>
                    <option>Ac.</option>
                  </select>
                </Field>

                <Field label="Total Scheme Value (RM)">
                  <input className="spa-input" placeholder="Total Scheme Value" />
                </Field>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Source of Fund" required>
                  <select className="spa-input">
                    <option>Project Rakyat</option>
                    <option>Private Fund</option>
                    <option>Government Fund</option>
                  </select>
                </Field>

                <Field label="Fund Availability" required>
                  <div className="flex items-center gap-4 h-[34px] text-xs">
                    <label className="flex items-center gap-1">
                      <input type="radio" name="fund" defaultChecked />
                      Yes
                    </label>

                    <label className="flex items-center gap-1">
                      <input type="radio" name="fund" />
                      No
                    </label>
                  </div>
                </Field>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Amount of Fund Available (RM)">
                  <input className="spa-input" defaultValue="13,800.00" />
                </Field>

                <Field label="Amount of Fund Approved (RM)" required>
                  <input className="spa-input" defaultValue="13,800.00" />
                </Field>
              </div>

              <SimpleWysiwygEditor
                label="Project Justification and Description on Project Components"
                defaultValue="A COLOURBOARD SHEET AND UV PRINTED STICKER..."
                max={3000}
              />

              <SimpleWysiwygEditor
                label="Reason for Selecting the Site"
                defaultValue="STRATEGIC LOCATION"
                max={1500}
              />

              <FormSection title="Affected Land(s)">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border border-slate-200">
                    <thead className="bg-[#f1f5f4]">
                      <tr>
                        <th className="p-2 border">#</th>
                        <th className="p-2 border">Description</th>
                        <th className="p-2 border">Locality</th>
                        <th className="p-2 border">Extract of Title Unit</th>
                      </tr>
                    </thead>

                    <tbody>
                      <tr>
                        <td className="p-2 border">1</td>
                        <td className="p-2 border">
                          Lot 3786 Block 207 Kuching North Land District
                        </td>
                        <td className="p-2 border">
                          JALAN SUPERMARKET HILL KUCHING
                        </td>
                        <td className="p-2 border text-red-600">
                          12/02/2026
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </FormSection>

              <div className="flex justify-end gap-2 pt-2">
                <Link
                  to="/applications"
                  className="px-3 py-1.5 border border-slate-300 rounded text-xs font-semibold hover:bg-slate-50"
                >
                  ← Back
                </Link>

                <Link
                  to="/applications/client-department"
                  className="px-3 py-1.5 bg-[#006d32] text-white rounded text-xs font-semibold hover:bg-[#005224]"
                >
                  Save & Next
                </Link>
              </div>
            </div>
          </section>
        </main>
      </div>
    </DashboardLayout>
  );
}

function LocationMap() {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const debounceRef = useRef(null);

  const defaultLng = 110.334028;
  const defaultLat = 1.586684;

  const [lng, setLng] = useState(defaultLng);
  const [lat, setLat] = useState(defaultLat);
  const [address, setAddress] = useState(
    "Muzium Kucing, Jalan Semariang, Petra Jaya, Kuching, Sarawak, Malaysia"
  );
  const [suggestions, setSuggestions] = useState([]);
  const [mode, setMode] = useState("2d");
  const [scene, setScene] = useState("street");
  const [loadingAddress, setLoadingAddress] = useState(false);
  const [searching, setSearching] = useState(false);

  const styles = {
    street: `https://api.maptiler.com/maps/streets-v2/style.json?key=${MAPTILER_KEY}`,
    satellite: `https://api.maptiler.com/maps/hybrid/style.json?key=${MAPTILER_KEY}`,
    outdoor: `https://api.maptiler.com/maps/outdoor-v2/style.json?key=${MAPTILER_KEY}`,
  };

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: styles.street,
      center: [defaultLng, defaultLat],
      zoom: 16,
      pitch: 0,
      bearing: 0,
    });

    mapRef.current = map;

    map.addControl(
      new maplibregl.NavigationControl({
        visualizePitch: true,
      }),
      "top-right"
    );

    markerRef.current = new maplibregl.Marker({
      color: "#dc2626",
      draggable: true,
    })
      .setLngLat([defaultLng, defaultLat])
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

  async function reverseGeocode(nextLng, nextLat) {
    try {
      setLoadingAddress(true);

      // Use Nominatim for reverse geocoding — returns building/POI names, not just streets
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
        // Prefer specific building/POI name over generic street
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

        const parts = [buildingName, road, suburb, city, state, "Malaysia"].filter(Boolean);
        setAddress(parts.join(", ") || data.display_name);
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
    }
  }

  async function fetchGeocodeResults(url) {
    const response = await fetch(url);
    const data = await response.json();
    return data?.features || [];
  }

  // Search via Nominatim (OpenStreetMap) — better for Malaysian buildings & POIs
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

    // Normalise to the same shape used by MapTiler results
    return data.map((item) => {
      const addr = item.address || {};
      // Build a readable label: prefer building/amenity name, then road, then full display_name
      const buildingName =
        addr.building || addr.amenity || addr.shop || addr.office || addr.tourism || "";
      const road = addr.road || addr.pedestrian || addr.footway || "";
      const suburb = addr.suburb || addr.neighbourhood || addr.quarter || "";
      const city = addr.city || addr.town || addr.village || addr.county || "";
      const state = addr.state || "";

      const shortLabel = buildingName || road || item.name || item.display_name.split(",")[0];
      const fullLabel = [buildingName, road, suburb, city, state, "Malaysia"]
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

      // 1. Try Nominatim first (best for buildings & Malaysian POIs)
      let results = await fetchNominatimResults(cleanKeyword);

      // 2. Fallback to MapTiler if Nominatim found nothing
      if (results.length === 0) {
        const encodedKuchingQuery = encodeURIComponent(
          `${cleanKeyword}, Kuching, Sarawak, Malaysia`
        );

        const kuchingUrl =
          `https://api.maptiler.com/geocoding/${encodedKuchingQuery}.json` +
          `?key=${MAPTILER_KEY}` +
          `&language=en` +
          `&country=my` +
          `&limit=8` +
          `&proximity=110.334028,1.586684` +
          `&bbox=109.7,0.8,111.2,2.2`;

        results = await fetchGeocodeResults(kuchingUrl);
      }

      // 3. Final fallback — Malaysia-wide MapTiler search
      if (results.length === 0) {
        const encodedMalaysiaQuery = encodeURIComponent(`${cleanKeyword}, Malaysia`);
        const malaysiaUrl =
          `https://api.maptiler.com/geocoding/${encodedMalaysiaQuery}.json` +
          `?key=${MAPTILER_KEY}` +
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
    const value = event.target.value;
    setAddress(value);

    window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      searchAddress(value);
    }, 350);
  }

  function selectSuggestion(place) {
    const [selectedLng, selectedLat] = place.center;

    setAddress(place.place_name);
    setSuggestions([]);

    updateLocationFromCoordinates(selectedLng, selectedLat, false);
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
            Search by building name, road, lot number or landmark across Malaysia. The selected result will be used as the project address. You may also drag the pin or click the map to update the address automatically.
          </p>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-700">
              Pinpoint Project Location
            </p>
            <p className="text-[11px] text-slate-500">
              Drag the red pin or click the map to update address, latitude, and longitude.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
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
              Satelit
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
      </div>
    </FormSection>
  );
}

function SiteImageUpload() {
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState(null);

  function handleFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;

    setImage(file);

    const reader = new FileReader();
    reader.onloadend = () => {
      setPreview(reader.result);
    };
    reader.readAsDataURL(file);
  }

  function removeImage() {
    setImage(null);
    setPreview(null);
  }

  return (
    <FormSection title="Gambar Tapak (Site Image)">
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
                <p className="text-[11px] text-slate-400">
                  JPG / PNG only
                </p>
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
                onClick={removeImage}
                className="absolute top-2 right-2 bg-red-500 text-white text-xs px-2 py-1 rounded hover:bg-red-600"
              >
                Remove
              </button>
            </div>

            <div className="flex justify-between items-center px-3 py-2 text-xs bg-[#f7f7f7] border-t">
              <span className="text-slate-600 truncate max-w-[70%]">
                {image?.name}
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
  return (
    <div className="bg-[#f5f5f5] border-b border-slate-200 px-4 py-3 text-xs">
      <div className="grid grid-cols-[140px_1fr] gap-y-1">
        <p>Digital Reference</p>
        <p className="font-semibold text-[#006d32]">E.SPA.2025-1443</p>

        <p>Agency Reference</p>
        <p className="font-semibold text-[#006d32]">SP/1D/159/2024</p>

        <p>Status</p>
        <p className="font-semibold text-[#006d32]">Prepare Case</p>

        <p>Application Type</p>
        <p className="font-semibold text-[#006d32]">
          Application of Siting Project
        </p>

        <p>Division</p>
        <p className="font-semibold text-[#006d32]">KUCHING</p>
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
      <input type="checkbox" defaultChecked={checked} />
      <span>{label}</span>
    </label>
  );
}

export default SittingApplicationPage;